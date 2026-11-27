// oxlint-disable vitest/require-mock-type-parameters
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Drives the real `create-endpoint --from-file` command against v2 files that
 * use removed or invalid partitioning, and asserts the actionable validation
 * failure. The same `endpointDefinitionSchema` backs the Studio import/export
 * gate, so this pins the CLI layer of that single rule.
 */

let testDir: string

vi.mock(import("@/config"), () => ({
  resolveSourcePath: () => Promise.resolve(testDir),
  loadConfig: async () => ({
    config: { dataSources: {}, sourcePath: "." },
    adapters: [],
  }),
}))

vi.mock(import("@/commands/create-registry"), () => ({
  runConfigRegistryGeneration: vi.fn().mockResolvedValue(null),
  default: vi.fn(),
}))

vi.mock(import("@lakeql/logger/console"), () => ({
  info: (message: string) => message,
  success: (message: string) => message,
}))

const { default: createEndpointCommandFactory } =
  await import("@/commands/create-endpoint")

function definitionWith(mutation: Record<string, unknown>) {
  return {
    version: "2.0",
    tableName: "events",
    catalog: "hive",
    schema: "analytics",
    fields: [
      { name: "event_id", type: "String" },
      { name: "event", type: "DateTime" },
    ],
    mutation: {
      loadStrategy: "append",
      basePath: "warehouse/analytics/events",
      ...mutation,
    },
  }
}

async function runWith(definition: unknown): Promise<unknown> {
  const defPath = path.join(testDir, "endpoint.json")
  await writeFile(defPath, JSON.stringify(definition))
  const command = createEndpointCommandFactory()
  try {
    await command.parseAsync(
      ["--from-file", defPath, "--source-path", testDir, "--skip-registry"],
      { from: "user" }
    )
  } catch (error) {
    return error
  }
  return undefined
}

describe("create-endpoint partitioning validation (integration)", () => {
  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `create-endpoint-partitioning-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testDir, { recursive: true })
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(testDir, { recursive: true, force: true })
  })

  it("rejects mutation.partitioningFormat with an actionable message", async () => {
    const error = await runWith(
      definitionWith({
        partitioning: "event_id",
        partitioningFormat: "year/month",
      })
    )

    expect(error).toMatchObject({ code: "ENDPOINT_VALIDATION_FAILED" })
    const details = (error as { details: string[] }).details.join("\n")
    expect(details).toContain("mutation.partitioningFormat")
    expect(details).toContain("no longer supported")
  })

  it("rejects a bare segment over a DateTime field and points at the component form", async () => {
    const error = await runWith(definitionWith({ partitioning: "event" }))

    expect(error).toMatchObject({ code: "ENDPOINT_VALIDATION_FAILED" })
    const details = (error as { details: string[] }).details.join("\n")
    expect(details).toContain("mutation.partitioning")
    expect(details).toContain('"event:year"')
  })
})
