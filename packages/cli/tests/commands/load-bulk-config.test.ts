// oxlint-disable vitest/require-to-throw-message
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockCwd = vi.fn<() => string>()
vi.mock(import("@/path-utils"), () => ({
  getInvocationCwd: () => mockCwd(),
  resolveFromInvocationCwd: (p: string) =>
    path.isAbsolute(p) ? p : path.resolve(mockCwd(), p),
}))

describe("loadBulkConfig", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `load-bulk-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testDir, { recursive: true })
    mockCwd.mockReturnValue(testDir)
    vi.resetModules()
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("loading .mjs files", () => {
    it("should load a valid .mjs config", async () => {
      const configContent = `export default [
  { schema: "schema1", tables: ["table1", "table2"] }
]\n`
      await writeFile(path.join(testDir, "import.config.mjs"), configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")
      const config = await loadBulkConfig("import.config.mjs")

      expect(config).toHaveLength(1)
      expect(config[0]).toStrictEqual({
        schema: "schema1",
        tables: ["table1", "table2"],
      })
    })

    it("should auto-discover import.config.mjs when no configPath provided", async () => {
      const configContent = `export default [
  { schema: "auto_discovered", tables: ["t1"] }
]\n`
      await writeFile(path.join(testDir, "import.config.mjs"), configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")
      const config = await loadBulkConfig()

      expect(config).toHaveLength(1)
      expect(config[0]?.schema).toBe("auto_discovered")
    })
  })

  describe("loading .json files", () => {
    it("should load a valid .json config", async () => {
      const configContent = JSON.stringify([
        { schema: "json_schema", tables: ["j1", "j2"] },
      ])
      await writeFile(path.join(testDir, "import.config.json"), configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")
      const config = await loadBulkConfig("import.config.json")

      expect(config).toHaveLength(1)
      expect(config[0]).toStrictEqual({
        schema: "json_schema",
        tables: ["j1", "j2"],
      })
    })

    it("should auto-discover import.config.json", async () => {
      const configContent = JSON.stringify([
        { schema: "json_auto", views: ["v1"] },
      ])
      await writeFile(path.join(testDir, "import.config.json"), configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")
      const config = await loadBulkConfig()

      expect(config).toHaveLength(1)
      expect(config[0]?.schema).toBe("json_auto")
    })
  })

  describe("loading .js files", () => {
    it("should load a valid .js config with named export", async () => {
      const configContent = `module.exports = [
  { schema: "js_schema", tables: ["js1"] }
]\n`
      await writeFile(path.join(testDir, "import.config.js"), configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")
      const config = await loadBulkConfig("import.config.js")

      expect(config).toHaveLength(1)
      expect(config[0]).toStrictEqual({
        schema: "js_schema",
        tables: ["js1"],
      })
    })
  })

  describe("multiple entries and catalogs", () => {
    it("should load config with multiple schemas and optional catalogs", async () => {
      const configContent = `export default [
  { schema: "public", tables: ["users", "posts"] },
  { schema: "analytics", catalog: "analytics_db", tables: ["events"] },
  { schema: "warehouse", tables: ["dim_date"], views: ["facts"] }
]\n`
      await writeFile(path.join(testDir, "import.config.mjs"), configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")
      const config = await loadBulkConfig()

      expect(config).toHaveLength(3)
      expect(config[0]).toStrictEqual({
        schema: "public",
        tables: ["users", "posts"],
      })
      expect(config[1]?.catalog).toBe("analytics_db")
      expect(config[2]?.views).toStrictEqual(["facts"])
    })
  })

  describe("empty configs", () => {
    it("should return empty array when config file is empty", async () => {
      const configContent = `export default []\n`
      await writeFile(path.join(testDir, "import.config.mjs"), configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")
      const config = await loadBulkConfig()

      expect(config).toStrictEqual([])
    })

    it("should return empty array when no config file found", async () => {
      const { loadBulkConfig } = await import("@/commands/bulk-pull")
      const config = await loadBulkConfig()

      expect(config).toStrictEqual([])
    })
  })

  describe("validation errors", () => {
    it("should reject config with entries missing schema", async () => {
      const configContent = `export default [
  { tables: ["t1"] }
]\n`
      await writeFile(path.join(testDir, "import.config.mjs"), configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")

      await expect(loadBulkConfig()).rejects.toThrow()
    })

    it("should reject config with entries having empty tables and views", async () => {
      const configContent = `export default [
  { schema: "invalid", tables: [], views: [] }
]\n`
      await writeFile(path.join(testDir, "import.config.mjs"), configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")

      await expect(loadBulkConfig()).rejects.toThrow()
    })

    it("should reject malformed JSON config", async () => {
      const configContent = `{ invalid json }`
      await writeFile(path.join(testDir, "import.config.json"), configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")

      await expect(loadBulkConfig("import.config.json")).rejects.toThrow()
    })
  })

  describe("explicit path handling", () => {
    it("should load config from custom path with extension", async () => {
      const configContent = `export default [
  { schema: "custom_path", tables: ["cp1"] }
]\n`
      await writeFile(path.join(testDir, "my-config.mjs"), configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")
      const config = await loadBulkConfig("my-config.mjs")

      expect(config).toHaveLength(1)
      expect(config[0]?.schema).toBe("custom_path")
    })

    it("should load config from absolute path", async () => {
      const configContent = `export default [
  { schema: "absolute_path", tables: ["ap1"] }
]\n`
      const absolutePath = path.join(testDir, "absolute-config.mjs")
      await writeFile(absolutePath, configContent)

      const { loadBulkConfig } = await import("@/commands/bulk-pull")
      const config = await loadBulkConfig(absolutePath)

      expect(config).toHaveLength(1)
      expect(config[0]?.schema).toBe("absolute_path")
    })
  })

  describe("priority when multiple config formats exist", () => {
    it("should prioritize .mjs over other formats in auto-discovery", async () => {
      // Create multiple config files
      await writeFile(
        path.join(testDir, "import.config.mjs"),
        `export default [{ schema: "mjs", tables: ["m1"] }]\n`
      )
      await writeFile(
        path.join(testDir, "import.config.json"),
        JSON.stringify([{ schema: "json", tables: ["j1"] }])
      )

      const { loadBulkConfig } = await import("@/commands/bulk-pull")
      const config = await loadBulkConfig()

      // c12 should load .mjs first by extension priority
      expect(config[0]?.schema).toBe("mjs")
    })
  })
})
