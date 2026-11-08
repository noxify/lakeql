// oxlint-disable vitest/require-mock-type-parameters
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, vi, it } from "vitest"

let testDir: string

const mockGetInvocationCwd = vi.fn(() => testDir)

vi.mock(import("@/path-utils"), () => ({
  getInvocationCwd: () => mockGetInvocationCwd(),
  resolveFromInvocationCwd: (p: string) =>
    path.isAbsolute(p) ? p : path.resolve(mockGetInvocationCwd(), p),
}))

/**
 * A minimal valid `.mjs` config exporting a `dataSources` object. `@lakeql/config`
 * requires a supported extension and a valid `dataSources` object.
 */
function validConfigModule(sourcePath?: string): string {
  const sourcePathLine =
    sourcePath === undefined
      ? ""
      : `  sourcePath: ${JSON.stringify(sourcePath)},\n`
  return `export default {\n${sourcePathLine}  dataSources: { warehouse: { adapter: "trino", connection: {} } },\n  adapters: [],\n}\n`
}

function loadConfigModule() {
  return import("../src/config")
}

type ConfigModule = Awaited<ReturnType<typeof loadConfigModule>>

/**
 * Freshly imports `../src/config` after resetting modules so the module-level
 * `cachedProject` cache does not leak between test cases.
 */
async function importFreshConfig(): Promise<ConfigModule> {
  vi.resetModules()
  return loadConfigModule()
}

async function setupTestDir(): Promise<void> {
  testDir = path.join(
    tmpdir(),
    `config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  await mkdir(testDir, { recursive: true })
}

async function cleanupTestDir(): Promise<void> {
  await rm(testDir, { recursive: true, force: true })
}

describe("loadConfig", () => {
  beforeEach(setupTestDir)
  afterEach(cleanupTestDir)

  it("loads a .mjs config with a valid dataSources object", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.mjs"),
      validConfigModule("lib")
    )

    const { loadConfig } = await importFreshConfig()
    const project = await loadConfig()

    expect(project.config.sourcePath).toBe("lib")
    expect(project.config.dataSources).toHaveProperty("warehouse")
  })

  it("defaults sourcePath to '.' when omitted", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.mjs"),
      validConfigModule()
    )

    const { loadConfig } = await importFreshConfig()
    const project = await loadConfig()

    expect(project.config.sourcePath).toBe(".")
  })

  it("throws a CliError when no config file exists", async () => {
    const { loadConfig } = await importFreshConfig()

    await expect(loadConfig()).rejects.toMatchObject({
      code: "LAKEQL_CONFIG_LOAD_FAILED",
    })
  })

  it("throws a CliError for an unsupported .json config", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.json"),
      JSON.stringify({ sourcePath: "src", dataSources: {} })
    )

    const { loadConfig } = await importFreshConfig()

    await expect(loadConfig()).rejects.toMatchObject({
      code: "LAKEQL_CONFIG_LOAD_FAILED",
    })
  })

  it("throws a CliError when dataSources is missing", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.mjs"),
      `export default { sourcePath: "src" }\n`
    )

    const { loadConfig } = await importFreshConfig()

    await expect(loadConfig()).rejects.toMatchObject({
      code: "LAKEQL_CONFIG_LOAD_FAILED",
    })
  })

  it("caches the project across repeated calls", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.mjs"),
      validConfigModule("lib")
    )

    const { loadConfig } = await importFreshConfig()
    const first = await loadConfig()
    const second = await loadConfig()

    expect(second).toBe(first)
  })
})

describe("resolveSourcePath", () => {
  beforeEach(setupTestDir)
  afterEach(cleanupTestDir)

  it("uses CLI override when provided as absolute path", async () => {
    const { resolveSourcePath } = await importFreshConfig()
    const result = await resolveSourcePath("/absolute/override")
    expect(result).toBe("/absolute/override")
  })

  it("resolves relative CLI override from invocation cwd", async () => {
    const { resolveSourcePath } = await importFreshConfig()
    const result = await resolveSourcePath("custom/path")
    expect(result).toBe(path.resolve(testDir, "custom/path"))
  })

  it("falls back to config sourcePath when no CLI override", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.mjs"),
      validConfigModule("src")
    )

    const { resolveSourcePath } = await importFreshConfig()
    const result = await resolveSourcePath()
    expect(result).toBe(path.resolve(testDir, "src"))
  })

  it("uses default sourcePath when config omits it", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.mjs"),
      validConfigModule()
    )

    const { resolveSourcePath } = await importFreshConfig()
    const result = await resolveSourcePath()
    expect(result).toBe(path.resolve(testDir, "."))
  })
})
