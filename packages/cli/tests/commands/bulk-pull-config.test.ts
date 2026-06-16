// oxlint-disable vitest/require-to-throw-message
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockCwd = vi.fn<() => string>(() => process.cwd())
vi.mock(import("@/path-utils"), () => ({
  getInvocationCwd: () => mockCwd(),
  resolveFromInvocationCwd: (p: string) =>
    path.isAbsolute(p) ? p : path.resolve(mockCwd(), p),
}))

describe("bulk-pull config loading", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `bulk-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testDir, { recursive: true })
    mockCwd.mockReturnValue(testDir)
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("valid config files", () => {
    it("should load a config with tables only", async () => {
      const configContent = `
export default [
  { schema: "schema1", tables: ["table1", "table2"] },
]
`
      const configPath = path.join(testDir, "import.config.mjs")
      await writeFile(configPath, configContent, "utf-8")

      const { pathToFileURL } = await import("node:url")
      const mod = await import(pathToFileURL(configPath).href)

      expect(mod.default).toHaveLength(1)
      expect(mod.default[0]).toStrictEqual({
        schema: "schema1",
        tables: ["table1", "table2"],
      })
    })

    it("should load a config with tables and views", async () => {
      const configContent = `
export default [
  { schema: "schema1", tables: ["t1"], views: ["v1", "v2"] },
]
`
      const configPath = path.join(testDir, "import.config.mjs")
      await writeFile(configPath, configContent, "utf-8")

      const { pathToFileURL } = await import("node:url")
      const mod = await import(pathToFileURL(configPath).href)

      expect(mod.default[0].tables).toStrictEqual(["t1"])
      expect(mod.default[0].views).toStrictEqual(["v1", "v2"])
    })

    it("should load a config with optional catalog override", async () => {
      const configContent = `
export default [
  { schema: "schema1", catalog: "custom_catalog", tables: ["t1"] },
  { schema: "schema2", tables: ["t2"] },
]
`
      const configPath = path.join(testDir, "import.config.mjs")
      await writeFile(configPath, configContent, "utf-8")

      const { pathToFileURL } = await import("node:url")
      const mod = await import(pathToFileURL(configPath).href)

      expect(mod.default).toHaveLength(2)
      expect(mod.default[0].catalog).toBe("custom_catalog")
      expect(mod.default[1].catalog).toBeUndefined()
    })

    it("should load an empty array config", async () => {
      const configContent = `export default []\n`
      const configPath = path.join(testDir, "empty.config.mjs")
      await writeFile(configPath, configContent, "utf-8")

      const { pathToFileURL } = await import("node:url")
      const mod = await import(pathToFileURL(configPath).href)

      expect(mod.default).toHaveLength(0)
    })

    it("should load a config with multiple schemas", async () => {
      const configContent = `
export default [
  { schema: "sales", tables: ["orders", "customers", "products"] },
  { schema: "analytics", tables: ["events"], views: ["daily_summary"] },
  { schema: "inventory", catalog: "warehouse", tables: ["stock_levels"] },
]
`
      const configPath = path.join(testDir, "multi.config.mjs")
      await writeFile(configPath, configContent, "utf-8")

      const { pathToFileURL } = await import("node:url")
      const mod = await import(pathToFileURL(configPath).href)

      expect(mod.default).toHaveLength(3)
      expect(mod.default[0].schema).toBe("sales")
      expect(mod.default[0].tables).toHaveLength(3)
      expect(mod.default[1].views).toStrictEqual(["daily_summary"])
      expect(mod.default[2].catalog).toBe("warehouse")
    })
  })

  describe("error handling", () => {
    it("should throw when config file does not exist", async () => {
      const { pathToFileURL } = await import("node:url")
      const nonExistentPath = path.join(testDir, "nonexistent.config.mjs")

      await expect(
        import(pathToFileURL(nonExistentPath).href)
      ).rejects.toThrow()
    })

    it("should throw when config file has syntax errors", async () => {
      const configContent = `export default [{ schema: "test" tables: }]`
      const configPath = path.join(testDir, "invalid.config.mjs")
      await writeFile(configPath, configContent, "utf-8")

      const { pathToFileURL } = await import("node:url")

      await expect(import(pathToFileURL(configPath).href)).rejects.toThrow()
    })
  })
})
