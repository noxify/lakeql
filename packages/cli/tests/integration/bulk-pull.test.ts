// oxlint-disable vitest/max-expects
// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable vitest/require-to-throw-message
// oxlint-disable eslint/max-classes-per-file
// oxlint-disable eslint/class-methods-use-this
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import type { Listr } from "listr2"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// --- Mocks ---

const mockExecutePull = vi.fn().mockResolvedValue(null)
vi.mock(import("@/commands/pull-action"), () => ({
  executePull: (...args: unknown[]) => mockExecutePull(...args),
}))

const mockRunConfigRegistryGeneration = vi.fn().mockResolvedValue(null)
vi.mock(import("@/commands/config-registry"), () => ({
  runConfigRegistryGeneration: (...args: unknown[]) =>
    mockRunConfigRegistryGeneration(...args),
  default: vi.fn(),
}))

const mockEnv = {
  HIVE_CATALOG: "default_catalog",
  HIVE_HOST: "localhost",
  HIVE_PASSWORD: "password",
  HIVE_PORT: 8080,
  HIVE_USERNAME: "user",
  LOG_LEVEL: "warn" as const,
}

vi.mock(import("@/env"), () => ({
  getEnv: () => mockEnv,
}))

let testDir: string

vi.mock(import("@/path-utils"), () => ({
  getInvocationCwd: () => testDir,
  resolveFromInvocationCwd: (p: string) =>
    path.isAbsolute(p) ? p : path.resolve(testDir, p),
}))

vi.mock(import("@/config"), () => ({
  resolveSourcePath: async (override?: string) => override ?? testDir,
  loadConfig: async () => ({ sourcePath: "." }),
}))

// Mock c12 to do a simple file import (like our previous implementation)
vi.mock(import("c12"), () => ({
  // oxlint-disable-next-line typescript/no-explicit-any
  loadConfig: async (opts: any) => {
    const { cwd, configFile, name } = opts

    // Determine the file path to load
    const filePath = configFile
      ? `${configFile}.mjs`
      : path.join(cwd, `${name}.config.mjs`)

    try {
      const fileUrl = pathToFileURL(filePath).href
      const mod = await import(fileUrl)
      return { config: mod.default }
    } catch {
      return { config: opts.defaults ?? {} }
    }
  },
}))

// Listr2 mock — run tasks synchronously without terminal rendering
interface MockTaskEntry {
  title: string
  enabled?: boolean
  task: (ctx: unknown, task: MockTask) => unknown
}

class MockTask {
  output = ""
  title = ""
  newListr(tasks: MockTaskEntry[], options: { concurrent?: boolean } = {}) {
    return new MockListr(tasks, options)
  }
}

class MockListr {
  private tasks: MockTaskEntry[]
  private options: { concurrent?: boolean; exitOnError?: boolean }

  constructor(
    tasks: MockTaskEntry[],
    options: { concurrent?: boolean; exitOnError?: boolean } = {}
  ) {
    this.tasks = tasks
    this.options = options
  }

  async run() {
    const enabledTasks = this.tasks.filter(
      (t) => t.enabled === undefined || t.enabled === true
    )

    if (this.options.concurrent) {
      await Promise.allSettled(
        enabledTasks.map((t) => t.task({}, new MockTask()))
      )
    } else {
      const results = await Promise.allSettled(
        enabledTasks.map(async (t) => {
          const result = t.task({}, new MockTask())
          return result instanceof MockListr ? result.run() : result
        })
      )

      // Re-throw if exitOnError and any task failed
      if (this.options.exitOnError !== false) {
        const rejected = results.find((r) => r.status === "rejected")
        if (rejected && rejected.status === "rejected") {
          throw rejected.reason
        }
      }
    }
  }
}

vi.mock(import("listr2"), () => ({
  Listr: MockListr as unknown as typeof Listr,
}))

// Must import after mocks
const { executeBulkPull } = await import("@/commands/bulk-pull")

// --- Helpers ---

async function writeConfig(entries: unknown[], fileName = "import.config.mjs") {
  const content = `export default ${JSON.stringify(entries, null, 2)}\n`
  const configPath = path.join(testDir, fileName)
  await writeFile(configPath, content, "utf-8")
  return configPath
}

// --- Tests ---

describe("bulk-pull (integration)", () => {
  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `bulk-pull-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testDir, { recursive: true })
    mockExecutePull.mockClear()
    mockRunConfigRegistryGeneration.mockClear()
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("basic execution", () => {
    it("should call executePull for each entry with tables", async () => {
      await writeConfig([
        { schema: "schema1", tables: ["table1", "table2"] },
        { schema: "schema2", tables: ["table3"] },
      ])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
      })

      expect(mockExecutePull).toHaveBeenCalledTimes(2)

      // First call: schema1 with 2 tables
      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({
          catalog: "default_catalog",
          schema: "schema1",
          tables: ["table1", "table2"],
          skipRegistry: true,
        })
      )

      // Second call: schema2 with 1 table
      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({
          catalog: "default_catalog",
          schema: "schema2",
          tables: ["table3"],
          skipRegistry: true,
        })
      )
    })

    it("should call executePull separately for tables and views", async () => {
      await writeConfig([
        { schema: "schema1", tables: ["t1"], views: ["v1", "v2"] },
      ])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
      })

      // Should be called twice: once for tables, once for views
      expect(mockExecutePull).toHaveBeenCalledTimes(2)

      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: "schema1",
          tables: ["t1"],
        })
      )

      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: "schema1",
          tables: ["v1", "v2"],
        })
      )
    })

    it("should skip executePull when tables and views are empty", async () => {
      await writeConfig([{ schema: "schema1", tables: [], views: [] }])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
      })

      expect(mockExecutePull).not.toHaveBeenCalled()
    })

    it("should handle entries with only views", async () => {
      await writeConfig([{ schema: "schema1", views: ["v1", "v2"] }])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
      })

      expect(mockExecutePull).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          schema: "schema1",
          tables: ["v1", "v2"],
        })
      )
    })
  })

  describe("catalog precedence", () => {
    it("should use CLI catalog over config catalog and ENV", async () => {
      await writeConfig([
        { schema: "schema1", catalog: "config_catalog", tables: ["t1"] },
      ])

      await executeBulkPull({
        configPath: "import.config.mjs",
        catalog: "cli_catalog",
        skipRegistry: true,
      })

      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({
          catalog: "cli_catalog",
        })
      )
    })

    it("should use config catalog over ENV when no CLI catalog", async () => {
      await writeConfig([
        { schema: "schema1", catalog: "config_catalog", tables: ["t1"] },
      ])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
      })

      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({
          catalog: "config_catalog",
        })
      )
    })

    it("should fall back to ENV catalog when neither CLI nor config provides one", async () => {
      await writeConfig([{ schema: "schema1", tables: ["t1"] }])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
      })

      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({
          catalog: "default_catalog",
        })
      )
    })

    it("should allow different catalogs per entry", async () => {
      await writeConfig([
        { schema: "schema1", catalog: "catalog_a", tables: ["t1"] },
        { schema: "schema2", catalog: "catalog_b", tables: ["t2"] },
        { schema: "schema3", tables: ["t3"] },
      ])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
      })

      expect(mockExecutePull).toHaveBeenCalledTimes(3)

      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({ catalog: "catalog_a", schema: "schema1" })
      )
      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({ catalog: "catalog_b", schema: "schema2" })
      )
      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({
          catalog: "default_catalog",
          schema: "schema3",
        })
      )
    })
  })

  describe("registry generation", () => {
    it("should call runConfigRegistryGeneration when skipRegistry is false", async () => {
      await writeConfig([{ schema: "schema1", tables: ["t1"] }])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: false,
      })

      expect(mockRunConfigRegistryGeneration).toHaveBeenCalledOnce()
    })

    it("should NOT call runConfigRegistryGeneration when skipRegistry is true", async () => {
      await writeConfig([{ schema: "schema1", tables: ["t1"] }])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
      })

      expect(mockRunConfigRegistryGeneration).not.toHaveBeenCalled()
    })

    it("should call registry with sourcePathOverride", async () => {
      await writeConfig([{ schema: "schema1", tables: ["t1"] }])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: false,
        sourcePathOverride: "/custom/path",
      })

      expect(mockRunConfigRegistryGeneration).toHaveBeenCalledWith(
        "/custom/path"
      )
    })

    it("should call registry exactly once even with multiple entries", async () => {
      await writeConfig([
        { schema: "schema1", tables: ["t1", "t2", "t3"] },
        { schema: "schema2", tables: ["t4", "t5"] },
        { schema: "schema3", views: ["v1"] },
      ])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: false,
      })

      expect(mockRunConfigRegistryGeneration).toHaveBeenCalledOnce()
    })
  })

  describe("source path handling", () => {
    it("should pass sourcePathOverride to executePull", async () => {
      await writeConfig([{ schema: "schema1", tables: ["t1"] }])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
        sourcePathOverride: "/custom/source",
      })

      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcePathOverride: "/custom/source",
        })
      )
    })
  })

  describe("empty config handling", () => {
    it("should not call executePull when config is empty array", async () => {
      await writeConfig([])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
      })

      expect(mockExecutePull).not.toHaveBeenCalled()
    })

    it("should not call registry when config is empty array", async () => {
      await writeConfig([])

      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: false,
      })

      expect(mockRunConfigRegistryGeneration).not.toHaveBeenCalled()
    })
  })

  describe("error resilience", () => {
    it("should continue other entries when one fails", async () => {
      mockExecutePull
        .mockResolvedValueOnce(null) // schema1 succeeds
        .mockRejectedValueOnce(new Error("Connection failed")) // schema2 fails
        .mockResolvedValueOnce(null) // schema3 succeeds

      await writeConfig([
        { schema: "schema1", tables: ["t1"] },
        { schema: "schema2", tables: ["t2"] },
        { schema: "schema3", tables: ["t3"] },
      ])

      // Should not throw because exitOnError is false on the concurrent subtask list
      await executeBulkPull({
        configPath: "import.config.mjs",
        skipRegistry: true,
      })

      expect(mockExecutePull).toHaveBeenCalledTimes(3)
    })
  })

  describe("config file path resolution", () => {
    it("should resolve relative config path from invocation cwd", async () => {
      await writeConfig([{ schema: "schema1", tables: ["t1"] }], "custom.mjs")

      await executeBulkPull({
        configPath: "custom.mjs",
        skipRegistry: true,
      })

      expect(mockExecutePull).toHaveBeenCalledOnce()
    })

    it("should support absolute config paths", async () => {
      const absolutePath = path.join(testDir, "absolute.config.mjs")
      const content = `export default [{ schema: "abs_schema", tables: ["t1"] }]\n`
      await writeFile(absolutePath, content, "utf-8")

      await executeBulkPull({
        configPath: absolutePath,
        skipRegistry: true,
      })

      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({ schema: "abs_schema" })
      )
    })

    it("should handle missing config file gracefully (returns empty config)", async () => {
      await executeBulkPull({
        configPath: "nonexistent.config.mjs",
        skipRegistry: true,
      })

      // c12 returns defaults when file is not found, resulting in empty config
      expect(mockExecutePull).not.toHaveBeenCalled()
    })
  })
})
