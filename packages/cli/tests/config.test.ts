// oxlint-disable vitest/require-mock-type-parameters
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

let testDir: string

const mockGetInvocationCwd = vi.fn(() => testDir)

vi.mock(import("@/path-utils"), () => ({
  getInvocationCwd: () => mockGetInvocationCwd(),
  resolveFromInvocationCwd: (p: string) =>
    path.isAbsolute(p) ? p : path.resolve(mockGetInvocationCwd(), p),
}))

// Import after mock setup
const { loadConfig, resolveSourcePath } = await import("../src/config")

describe(loadConfig, () => {
  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test("returns default config when no config file exists", async () => {
    const config = await loadConfig()
    expect(config).toStrictEqual({ sourcePath: "." })
  })

  test("loads config from lakeql.config.json", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.json"),
      JSON.stringify({ sourcePath: "src" })
    )

    const config = await loadConfig()
    expect(config.sourcePath).toBe("src")
  })

  test("loads config from lakeql.config.mjs", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.mjs"),
      `export default { sourcePath: "lib" }\n`
    )

    const config = await loadConfig()
    expect(config.sourcePath).toBe("lib")
  })

  test("prefers .mjs over .json when both exist", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.mjs"),
      `export default { sourcePath: "from-mjs" }\n`
    )
    await writeFile(
      path.join(testDir, "lakeql.config.json"),
      JSON.stringify({ sourcePath: "from-json" })
    )

    const config = await loadConfig()
    expect(config.sourcePath).toBe("from-mjs")
  })

  test("merges with defaults for partial config", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.json"),
      JSON.stringify({})
    )

    const config = await loadConfig()
    expect(config).toStrictEqual({ sourcePath: "." })
  })
})

describe(resolveSourcePath, () => {
  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test("uses CLI override when provided as absolute path", async () => {
    const result = await resolveSourcePath("/absolute/override")
    expect(result).toBe("/absolute/override")
  })

  test("resolves relative CLI override from invocation cwd", async () => {
    const result = await resolveSourcePath("custom/path")
    expect(result).toBe(path.resolve(testDir, "custom/path"))
  })

  test("falls back to config sourcePath when no CLI override", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.json"),
      JSON.stringify({ sourcePath: "src" })
    )

    const result = await resolveSourcePath()
    expect(result).toBe(path.resolve(testDir, "src"))
  })

  test("uses default sourcePath when no config file and no override", async () => {
    const result = await resolveSourcePath()
    expect(result).toBe(path.resolve(testDir, "."))
  })
})
