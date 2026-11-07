// oxlint-disable vitest/max-expects
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// --- mocks ---

const mockConfirm = vi.fn<(question: string) => Promise<boolean>>()
vi.mock(import("@topcli/prompts"), () => ({
  confirm: (question: string) => mockConfirm(question),
}))

let testDir: string

vi.mock(import("@/path-utils"), () => ({
  getInvocationCwd: () => testDir,
  resolveFromInvocationCwd: (p: string) =>
    path.isAbsolute(p) ? p : path.resolve(testDir, p),
}))

vi.mock(import("@/config"), () => ({
  resolveSourcePath: async (override?: string) => override ?? testDir,
  loadConfig: async () => ({
    config: { dataSources: {}, sourcePath: "." },
    adapters: [],
  }),
}))

vi.mock(import("@lakeql/logger/console"), () => ({
  info: (msg: string) => `INFO ${msg}`,
  success: (msg: string) => `SUCCESS ${msg}`,
  warning: (msg: string) => `WARN ${msg}`,
}))

// Must import after mocks
const { default: GenerateImportConfigCommand } =
  await import("@/commands/generate-import-config")

// --- helpers ---

function makeCommand() {
  return GenerateImportConfigCommand()
}

interface Endpoint {
  dataSource: string
  adapter: string
  catalog: string
  schema: string
  tableName: string
}

/**
 * Writes a generated endpoint on disk mirroring the real 4-level layout
 * (`schemas/generated/<dataSource>/<catalog>/<schema>/<table>/config.ts`) with
 * a real `config.ts` exporting the authoritative `sourceConfig`.
 */
async function writeEndpoint(endpoint: Endpoint) {
  const dir = path.join(
    testDir,
    "schemas",
    "generated",
    endpoint.dataSource,
    endpoint.catalog,
    endpoint.schema,
    endpoint.tableName
  )
  await mkdir(dir, { recursive: true })
  const configContent = `export const sourceConfig = {
  dataSource: ${JSON.stringify(endpoint.dataSource)},
  adapter: ${JSON.stringify(endpoint.adapter)},
  catalog: ${JSON.stringify(endpoint.catalog)},
  schema: ${JSON.stringify(endpoint.schema)},
  tableName: ${JSON.stringify(endpoint.tableName)},
} as const
`
  await writeFile(path.join(dir, "config.ts"), configContent, "utf-8")
}

async function readOutput() {
  return readFile(path.join(testDir, "import.config.mjs"), "utf-8")
}

// --- tests ---

describe("generate-import-config", () => {
  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `gen-import-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testDir, { recursive: true })
    mockConfirm.mockReset()
    mockConfirm.mockResolvedValue(true)
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  describe("reads config.ts sourceConfig (not directory layout)", () => {
    it("emits dataSource/catalog/schema/tables from sourceConfig and groups by (dataSource, catalog, schema)", async () => {
      await writeEndpoint({
        dataSource: "trino",
        adapter: "trino",
        catalog: "hive",
        schema: "tier1_open_lake",
        tableName: "itaps_v2_environments_latest",
      })
      await writeEndpoint({
        dataSource: "trino",
        adapter: "trino",
        catalog: "hive",
        schema: "tier1_open_lake",
        tableName: "another_table",
      })
      await writeEndpoint({
        dataSource: "fabric",
        adapter: "fabric",
        catalog: "fabric",
        schema: "Processed_LH",
        tableName: "tier1_open_lake",
      })

      await makeCommand().parseAsync(
        ["--output", path.join(testDir, "import.config.mjs")],
        { from: "user" }
      )

      const written = await readOutput()

      // Correct, authoritative values from sourceConfig.
      expect(written).toContain(`dataSource: "trino"`)
      expect(written).toContain(`dataSource: "fabric"`)
      expect(written).toContain(`catalog: "hive"`)
      expect(written).toContain(`catalog: "fabric"`)
      expect(written).toContain(`schema: "tier1_open_lake"`)
      expect(written).toContain(`schema: "Processed_LH"`)
      expect(written).toContain(`"itaps_v2_environments_latest"`)
      expect(written).toContain(`"another_table"`)

      // Grouped: trino/hive/tier1_open_lake collects both tables into one entry.
      const parsed = (await import(
        `${path.join(testDir, "import.config.mjs")}?t=${Date.now()}`
      )) as { default: unknown[] }
      const entries = parsed.default as {
        dataSource: string
        catalog: string
        schema: string
        tables: string[]
      }[]

      expect(entries).toHaveLength(2)

      const trinoEntry = entries.find((e) => e.dataSource === "trino")
      expect(trinoEntry).toStrictEqual({
        dataSource: "trino",
        catalog: "hive",
        schema: "tier1_open_lake",
        tables: ["another_table", "itaps_v2_environments_latest"],
      })

      const fabricEntry = entries.find((e) => e.dataSource === "fabric")
      expect(fabricEntry).toStrictEqual({
        dataSource: "fabric",
        catalog: "fabric",
        schema: "Processed_LH",
        tables: ["tier1_open_lake"],
      })
    })

    it("does NOT include an adapter field in emitted entries", async () => {
      await writeEndpoint({
        dataSource: "trino",
        adapter: "trino",
        catalog: "hive",
        schema: "analytics",
        tableName: "events",
      })

      await makeCommand().parseAsync(
        ["--output", path.join(testDir, "import.config.mjs")],
        { from: "user" }
      )

      const written = await readOutput()
      expect(written).not.toContain("adapter")
    })

    it("does NOT reproduce the old level-shift bug (dataSource as catalog, catalog as schema)", async () => {
      // Repro of the reported bug: the old scan read directory names and
      // shifted one level, emitting dataSourceName AS catalog and catalog AS
      // schema. Assert that never happens with the sourceConfig-based scan.
      await writeEndpoint({
        dataSource: "trino",
        adapter: "trino",
        catalog: "hive",
        schema: "tier1_open_lake",
        tableName: "itaps_v2_environments_latest",
      })
      await writeEndpoint({
        dataSource: "fabric",
        adapter: "fabric",
        catalog: "fabric_wh",
        schema: "Processed_LH",
        tableName: "tier1_open_lake",
      })

      await makeCommand().parseAsync(
        ["--output", path.join(testDir, "import.config.mjs")],
        { from: "user" }
      )

      const parsed = (await import(
        `${path.join(testDir, "import.config.mjs")}?t=${Date.now()}`
      )) as { default: unknown[] }
      const entries = parsed.default as {
        dataSource: string
        catalog: string
        schema: string
        tables: string[]
      }[]

      // The buggy output emitted dataSourceName AS catalog (e.g.
      // { catalog: "trino", schema: "hive" }) with NO dataSource field — i.e.
      // catalog === a dataSource name and schema === a catalog name.
      for (const entry of entries) {
        expect(entry.dataSource).toBeDefined()
        // catalog must never equal a data source name (the shift signature).
        expect(["trino", "fabric"]).not.toContain(entry.catalog)
      }

      // The real trino entry carries schema "tier1_open_lake" (the actual
      // schema), not "hive" (the catalog) that the shift would have produced.
      const trinoEntry = entries.find((e) => e.dataSource === "trino")
      expect(trinoEntry?.schema).toBe("tier1_open_lake")
      expect(trinoEntry?.catalog).toBe("hive")

      // The fabric entry carries its real schema, not the shifted catalog.
      const fabricEntry = entries.find((e) => e.dataSource === "fabric")
      expect(fabricEntry?.schema).toBe("Processed_LH")
      expect(fabricEntry?.catalog).toBe("fabric_wh")
    })
  })

  describe("error handling", () => {
    it("throws when schemas/generated does not exist", async () => {
      await expect(
        makeCommand().parseAsync(
          ["--output", path.join(testDir, "import.config.mjs")],
          { from: "user" }
        )
      ).rejects.toThrow("No generated schemas found")
    })

    it("throws when schemas/generated has no endpoint configs", async () => {
      await mkdir(path.join(testDir, "schemas", "generated"), {
        recursive: true,
      })

      await expect(
        makeCommand().parseAsync(
          ["--output", path.join(testDir, "import.config.mjs")],
          { from: "user" }
        )
      ).rejects.toThrow("No generated endpoint configs found")
    })
  })

  describe("confirm flow", () => {
    beforeEach(async () => {
      await writeEndpoint({
        dataSource: "trino",
        adapter: "trino",
        catalog: "hive",
        schema: "analytics",
        tableName: "events",
      })
    })

    it("writes without confirmation when output file does not exist", async () => {
      await makeCommand().parseAsync(
        ["--output", path.join(testDir, "import.config.mjs")],
        { from: "user" }
      )

      expect(mockConfirm).not.toHaveBeenCalled()
    })

    it("asks to overwrite when output file already exists", async () => {
      await writeFile(
        path.join(testDir, "import.config.mjs"),
        "// old config",
        "utf-8"
      )

      await makeCommand().parseAsync(
        ["--output", path.join(testDir, "import.config.mjs")],
        { from: "user" }
      )

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.stringContaining("Overwrite")
      )
    })

    it("aborts when user declines overwrite confirmation", async () => {
      await writeFile(
        path.join(testDir, "import.config.mjs"),
        "// old config",
        "utf-8"
      )
      mockConfirm.mockResolvedValue(false)

      await expect(
        makeCommand().parseAsync(
          ["--output", path.join(testDir, "import.config.mjs")],
          { from: "user" }
        )
      ).rejects.toThrow("Aborted")

      const unchanged = await readOutput()
      expect(unchanged).toBe("// old config")
    })

    it("skips confirmation and overwrites with --force", async () => {
      await writeFile(
        path.join(testDir, "import.config.mjs"),
        "// old config",
        "utf-8"
      )

      await makeCommand().parseAsync(
        ["--output", path.join(testDir, "import.config.mjs"), "--force"],
        { from: "user" }
      )

      expect(mockConfirm).not.toHaveBeenCalled()
      const written = await readOutput()
      expect(written).toContain(`dataSource: "trino"`)
    })
  })
})
