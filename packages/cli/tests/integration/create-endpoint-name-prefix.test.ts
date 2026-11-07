// oxlint-disable vitest/require-mock-type-parameters
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Pins the deliberate design contract that `create-endpoint` is prefix-unaware.
 *
 * Unlike `pull` / `bulk-pull`, `create-endpoint` builds from a manual endpoint
 * JSON and never resolves a live data-source config, so it has no `namePrefix`
 * to forward even when the referenced `dataSource` is configured with one. This
 * test drives the real command end to end and asserts the generated names carry
 * no prefix, guarding the documented decision against regression.
 */

let testDir: string

// `loadConfig` is stubbed alongside `resolveSourcePath` so this regression
// guard stays honest: were `create-endpoint` ever made prefix-aware, it would
// fail on the prefix contract below rather than on a missing config loader.
vi.mock(import("@/config"), () => ({
  resolveSourcePath: () => Promise.resolve(testDir),
  loadConfig: async () => ({
    config: { dataSources: {}, sourcePath: "." },
    adapters: [],
  }),
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

const { default: createEndpointCommandFactory } =
  await import("@/commands/create-endpoint")

// A definition whose `dataSource` names a source that, in the user's config,
// carries a namePrefix. create-endpoint never reads that config, so the prefix
// must not appear in the generated output.
const definition = {
  version: "1.0",
  tableName: "order_line_items",
  catalog: "hive",
  schema: "analytics_sales",
  dataSource: "trino_source",
  fields: [{ name: "event_id", type: "String" }],
}

describe("create-endpoint namePrefix contract (integration)", () => {
  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `create-endpoint-name-prefix-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testDir, { recursive: true })
    vi.spyOn(console, "log").mockImplementation(() => {})
    mockRunConfigRegistryGeneration.mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(testDir, { recursive: true, force: true })
  })

  it("generates unprefixed names even when the referenced dataSource would carry a prefix", async () => {
    const defPath = path.join(testDir, "endpoint.json")
    await writeFile(defPath, JSON.stringify(definition))

    const command = createEndpointCommandFactory()
    await command.parseAsync(
      ["--from-file", defPath, "--source-path", testDir, "--skip-registry"],
      { from: "user" }
    )

    const outDir = path.join(
      testDir,
      "schemas/custom/hive/analytics_sales/order_line_items"
    )
    const interfaceContent = await readFile(
      path.join(outDir, "interface.ts"),
      "utf-8"
    )
    const configContent = await readFile(
      path.join(outDir, "config.ts"),
      "utf-8"
    )

    // Unprefixed names are present...
    expect(interfaceContent).toContain("AnalyticsSales_OrderLineItems")
    expect(configContent).toContain("analyticsSalesOrderLineItems")
    // ...and no prefixed variant leaks in from the dataSource name.
    expect(interfaceContent).not.toContain("Trino_")
    expect(configContent).not.toContain("trinoAnalyticsSales")
    expect(configContent).not.toContain("createTrinoAnalyticsSales")
  })
})
