import path from "node:path"

import { fs as memfs, vol } from "memfs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// --- fs mocks (must come before any subject imports) ---
// memfs is not 100% type-compatible with node:fs, suppress the mismatch
// @ts-expect-error — IFs missing __promisify__ overloads present in @types/node
vi.mock(import("node:fs"), () => memfs)
// @ts-expect-error — FsPromisesApi missing FileHandle members present in @types/node
vi.mock(import("node:fs/promises"), () => memfs.promises)

// --- other mocks ---

const mockConfirm = vi.fn<(question: string) => Promise<boolean>>()
vi.mock(import("@topcli/prompts"), () => ({
  confirm: (question: string) => mockConfirm(question),
}))

vi.mock(import("@/path-utils"), () => ({
  getInvocationCwd: () => "/project",
  resolveFromInvocationCwd: (p: string) =>
    path.isAbsolute(p) ? p : path.resolve("/project", p),
}))

vi.mock(import("@/config"), () => ({
  resolveSourcePath: async (override?: string) => override ?? "/project",
  loadConfig: async () => ({ sourcePath: "." }),
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

function setupSchemas(
  entries: { catalog: string; schema: string; tables: string[] }[]
) {
  const dirs: Record<string, null> = {}
  for (const { catalog, schema, tables } of entries) {
    for (const table of tables) {
      dirs[`/project/schemas/generated/${catalog}/${schema}/${table}`] = null
    }
  }
  vol.fromJSON(dirs)
}

// --- tests ---

describe("generate-import-config", () => {
  beforeEach(() => {
    vol.reset()
    mockConfirm.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("schema scanning", () => {
    it("generates correct config from a single catalog/schema with multiple tables", async () => {
      setupSchemas([
        { catalog: "hive", schema: "analytics", tables: ["events", "users"] },
      ])
      mockConfirm.mockResolvedValue(true)
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      await makeCommand().parseAsync(
        ["--output", "/project/import.config.mjs"],
        { from: "user" }
      )

      const written = memfs.readFileSync("/project/import.config.mjs", "utf-8")
      expect(written).toContain(`catalog: "hive"`)
      expect(written).toContain(`schema: "analytics"`)
      expect(written).toContain(`"events"`)
      expect(written).toContain(`"users"`)
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Written to"))
    })

    it("generates correct config from multiple catalogs and schemas", async () => {
      setupSchemas([
        { catalog: "hive", schema: "analytics", tables: ["events"] },
        { catalog: "hive", schema: "sales", tables: ["orders", "products"] },
        { catalog: "iceberg", schema: "raw", tables: ["logs"] },
      ])
      mockConfirm.mockResolvedValue(true)
      vi.spyOn(console, "log").mockImplementation(() => {})

      await makeCommand().parseAsync(
        ["--output", "/project/import.config.mjs"],
        { from: "user" }
      )

      const written = memfs.readFileSync("/project/import.config.mjs", "utf-8")
      expect(written).toContain(`catalog: "hive"`)
      expect(written).toContain(`schema: "analytics"`)
      expect(written).toContain(`schema: "sales"`)
      expect(written).toContain(`catalog: "iceberg"`)
      expect(written).toContain(`schema: "raw"`)
    })

    it("skips schemas dirs that contain no table subdirs", async () => {
      // Only create the schema dir, no table dirs inside
      vol.fromJSON({
        "/project/schemas/generated/hive/empty-schema/.gitkeep": "",
      })
      mockConfirm.mockResolvedValue(true)
      vi.spyOn(console, "log").mockImplementation(() => {})

      await makeCommand().parseAsync(
        ["--output", "/project/import.config.mjs"],
        { from: "user" }
      )

      const written = memfs.readFileSync("/project/import.config.mjs", "utf-8")
      expect(written).not.toContain(`schema: "empty-schema"`)
      expect(written).toContain("export default [\n]")
    })

    it("throws when schemas/generated does not exist", async () => {
      // vol is empty — no generated dir
      await expect(
        makeCommand().parseAsync(["--output", "/project/import.config.mjs"], {
          from: "user",
        })
      ).rejects.toThrow("No generated schemas found")
    })

    it("throws when schemas/generated is empty (no catalogs)", async () => {
      vol.fromJSON({ "/project/schemas/generated/.gitkeep": "" })

      await expect(
        makeCommand().parseAsync(["--output", "/project/import.config.mjs"], {
          from: "user",
        })
      ).rejects.toThrow("No catalogs found")
    })
  })

  describe("confirm flow", () => {
    beforeEach(() => {
      setupSchemas([
        { catalog: "hive", schema: "analytics", tables: ["events"] },
      ])
      vi.spyOn(console, "log").mockImplementation(() => {})
    })

    it("writes without confirmation when output file does not exist", async () => {
      mockConfirm.mockResolvedValue(true)

      await makeCommand().parseAsync(
        ["--output", "/project/import.config.mjs"],
        { from: "user" }
      )

      expect(mockConfirm).not.toHaveBeenCalled()
      expect(memfs.existsSync("/project/import.config.mjs")).toBeTruthy()
    })

    it("asks 'Overwrite' when output file already exists", async () => {
      vol.fromJSON({
        "/project/import.config.mjs": "// old config",
        "/project/schemas/generated/hive/analytics/events/.keep": "",
      })
      mockConfirm.mockResolvedValue(true)

      await makeCommand().parseAsync(
        ["--output", "/project/import.config.mjs"],
        { from: "user" }
      )

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.stringContaining("Overwrite")
      )
    })

    it("aborts when user declines overwrite confirmation", async () => {
      vol.fromJSON({
        "/project/import.config.mjs": "// old config",
        "/project/schemas/generated/hive/analytics/events/.keep": "",
      })
      mockConfirm.mockResolvedValue(false)

      await expect(
        makeCommand().parseAsync(["--output", "/project/import.config.mjs"], {
          from: "user",
        })
      ).rejects.toThrow("Aborted")

      // File should remain unchanged
      expect(memfs.readFileSync("/project/import.config.mjs", "utf-8")).toBe(
        "// old config"
      )
    })

    it("skips confirmation and overwrites with --force", async () => {
      vol.fromJSON({
        "/project/import.config.mjs": "// old config",
        "/project/schemas/generated/hive/analytics/events/.keep": "",
      })
      // confirm should NOT be called

      await makeCommand().parseAsync(
        ["--output", "/project/import.config.mjs", "--force"],
        { from: "user" }
      )

      expect(mockConfirm).not.toHaveBeenCalled()
      const written = memfs.readFileSync("/project/import.config.mjs", "utf-8")
      expect(written).toContain(`catalog: "hive"`)
    })
  })
})
