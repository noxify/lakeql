// oxlint-disable vitest/max-expects
// oxlint-disable vitest/require-mock-type-parameters
import { readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import type { ColumnInfo, DataSource } from "@lakeql/datasource"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  makeResolvedDataSource,
  makeStubDataSource,
} from "../support/mock-datasource"

/**
 * End-to-end coverage for the `pull` / `bulk-pull` → `executePull` →
 * `generateEndpoint` forwarding of a configured `namePrefix`.
 *
 * Unlike the command-output tests, `executePull` is NOT mocked here: the real
 * generation pipeline runs and writes files to a temp directory, so these tests
 * assert that `dsConfig.namePrefix` actually flows from a resolved data-source
 * config through the command layer into the prefixed generated names.
 */

let testDir: string

const SAMPLE_COLUMNS: ColumnInfo[] = [
  { name: "order_id", type: "varchar" },
  { name: "total_amount", type: "integer" },
]

// resolveDataSource is reassigned per-test so each case can supply a config
// with or without a namePrefix.
let currentResolved = makeResolvedDataSource({ name: "default" })

vi.mock(import("@/resolve-datasource"), () => ({
  resolveDataSource: () => Promise.resolve(currentResolved),
}))

vi.mock(import("@/resolve-catalog"), () => ({
  resolveCatalog: () => Promise.resolve("hive"),
}))

vi.mock(import("@/config"), () => ({
  resolveSourcePath: () => Promise.resolve(testDir),
  loadConfig: () =>
    Promise.resolve({
      // Single configured source so a bulk entry may omit `dataSource` and
      // default to it.
      config: { dataSources: { default: {} }, sourcePath: "." },
      adapters: [],
      // oxlint-disable-next-line typescript/no-explicit-any
    }) as any,
}))

const mockRunConfigRegistryGeneration = vi.fn().mockResolvedValue(null)
vi.mock(import("@/commands/create-registry"), () => ({
  runConfigRegistryGeneration: (...args: unknown[]) =>
    mockRunConfigRegistryGeneration(...args),
  default: vi.fn(),
}))

vi.mock(import("@lakeql/logger/console"), () => ({
  info: (message: string) => message,
  success: (message: string) => message,
}))

vi.mock(import("c12"), () => ({
  // oxlint-disable-next-line typescript/no-explicit-any
  loadConfig: async (): Promise<any> => ({
    config: [{ schema: "analytics", tables: ["events"] }],
  }),
}))

const { default: pullCommandFactory } = await import("@/commands/pull")
const { executeBulkPull } = await import("@/commands/bulk-pull")

function stubWithColumns(): DataSource {
  return makeStubDataSource({
    columns: vi.fn(() => Promise.resolve(SAMPLE_COLUMNS)),
  })
}

async function readGeneratedConfig(): Promise<string> {
  return readFile(
    path.join(
      testDir,
      "schemas/generated/default/hive/analytics/events/config.ts"
    ),
    "utf-8"
  )
}

async function readGeneratedInterface(): Promise<string> {
  return readFile(
    path.join(
      testDir,
      "schemas/generated/default/hive/analytics/events/interface.ts"
    ),
    "utf-8"
  )
}

describe("pull namePrefix forwarding (integration)", () => {
  beforeEach(() => {
    testDir = path.join(
      tmpdir(),
      `pull-name-prefix-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    vi.spyOn(console, "log").mockImplementation(() => {})
    mockRunConfigRegistryGeneration.mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(testDir, { recursive: true, force: true })
  })

  describe("pull command", () => {
    it("forwards a configured namePrefix into the generated names", async () => {
      currentResolved = makeResolvedDataSource({
        name: "default",
        dataSource: stubWithColumns(),
      })
      ;(currentResolved.config as { namePrefix?: string }).namePrefix = "trino"

      const command = pullCommandFactory()
      await command.parseAsync(
        [
          "--catalog",
          "hive",
          "--schema",
          "analytics",
          "--table",
          "events",
          "--skip-registry",
        ],
        { from: "user" }
      )

      const configContent = await readGeneratedConfig()
      const interfaceContent = await readGeneratedInterface()

      // Query / mutation names are prefixed (seamless camelCase).
      expect(configContent).toContain("trinoAnalyticsEvents")
      expect(configContent).toContain("createTrinoAnalyticsEvents")
      // The base type name carries the prefix as a leading `_`-separated segment.
      expect(interfaceContent).toContain("Trino_Analytics_Events")
    })

    it("produces unprefixed names when no namePrefix is configured", async () => {
      currentResolved = makeResolvedDataSource({
        name: "default",
        dataSource: stubWithColumns(),
      })

      const command = pullCommandFactory()
      await command.parseAsync(
        [
          "--catalog",
          "hive",
          "--schema",
          "analytics",
          "--table",
          "events",
          "--skip-registry",
        ],
        { from: "user" }
      )

      const configContent = await readGeneratedConfig()
      const interfaceContent = await readGeneratedInterface()

      expect(configContent).toContain("analyticsEvents")
      expect(configContent).not.toContain("trinoAnalyticsEvents")
      expect(interfaceContent).toContain("Analytics_Events")
      expect(interfaceContent).not.toContain("Trino_Analytics_Events")
    })
  })

  describe("bulk-pull command", () => {
    it("forwards a configured namePrefix into the generated names", async () => {
      currentResolved = makeResolvedDataSource({
        name: "default",
        dataSource: stubWithColumns(),
      })
      ;(currentResolved.config as { namePrefix?: string }).namePrefix = "trino"

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
      })

      const configContent = await readGeneratedConfig()
      const interfaceContent = await readGeneratedInterface()

      expect(configContent).toContain("trinoAnalyticsEvents")
      expect(configContent).toContain("createTrinoAnalyticsEvents")
      expect(interfaceContent).toContain("Trino_Analytics_Events")
    })
  })
})
