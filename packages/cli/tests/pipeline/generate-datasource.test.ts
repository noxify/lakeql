import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { generateEndpoint } from "@/pipeline/generate"
import type { EndpointDefinitionFormat } from "@/pipeline/schema"

/** Minimal valid endpoint definition for exercising the generation pipeline. */
function definition(
  overrides: Partial<EndpointDefinitionFormat> = {}
): EndpointDefinitionFormat {
  return {
    version: "1.0",
    tableName: "test_table",
    catalog: "my_catalog",
    schema: "my_schema",
    fields: [{ name: "id", type: "String" }],
    ...overrides,
  }
}

describe("generateEndpoint - dataSourceName plumbing", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(path.join(tmpdir(), "generate-datasource-"))
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("emits the provided dataSourceName in config.ts", async () => {
    const outputDir = path.join(testDir, "out")
    await generateEndpoint({
      definition: definition({ dataSource: "trino" }),
      outputDir,
      skipRegistry: true,
      dataSourceName: "trino",
    })

    const config = await readFile(path.join(outputDir, "config.ts"), "utf-8")
    expect(config).toContain('dataSource: "trino"')
  })

  it('falls back to "default" when dataSourceName is omitted', async () => {
    const outputDir = path.join(testDir, "out")
    await generateEndpoint({
      definition: definition(),
      outputDir,
      skipRegistry: true,
    })

    const config = await readFile(path.join(outputDir, "config.ts"), "utf-8")
    expect(config).toContain('dataSource: "default"')
  })
})
