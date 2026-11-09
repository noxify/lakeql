// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable unicorn/no-useless-undefined
import { existsSync } from "node:fs"
import { readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EndpointDefinitionFormat } from "@/pipeline/schema"

// Mock the config-registry to avoid env/config dependencies
vi.mock(import("@/commands/create-registry"), () => ({
  runConfigRegistryGeneration: vi.fn().mockResolvedValue(undefined),
  default: vi.fn(),
}))

// Must import generateEndpoint after mock is set up
const { generateEndpoint } = await import("@/pipeline/generate")

/**
 * Endpoint definition with mutation enabled and validations on root fields as
 * well as fields nested inside an Object and inside an Array-of-Object.
 */
const validatedDefinition: EndpointDefinitionFormat = {
  version: "1.0",
  tableName: "user_events",
  catalog: "analytics",
  schema: "tracking",
  mutation: {
    loadStrategy: "full_load",
    basePath: "warehouse/analytics/tracking/user_events",
    partitioning: true,
    partitioningFormat: "year/month/day",
  },
  fields: [
    {
      name: "email",
      type: "String",
      options: { required: true, validations: [{ type: "email" }] },
    },
    {
      name: "metadata",
      type: "Object",
      options: { required: true },
      fields: [
        {
          name: "homepage",
          type: "String",
          options: { required: true, validations: [{ type: "url" }] },
        },
        { name: "source", type: "String", options: { required: true } },
      ],
    },
    {
      name: "dimensions",
      type: "Array",
      options: { required: true },
      items: {
        type: "Object",
        fields: [
          {
            name: "key",
            type: "String",
            options: {
              required: true,
              validations: [{ type: "min", value: 1 }],
            },
          },
          { name: "value", type: "Float", options: { required: true } },
        ],
      },
    },
  ],
}

/**
 * Endpoint definition with mutation enabled but no validations anywhere.
 */
const noValidationDefinition: EndpointDefinitionFormat = {
  version: "1.0",
  tableName: "plain_events",
  catalog: "analytics",
  schema: "tracking",
  mutation: {
    loadStrategy: "full_load",
    basePath: "warehouse/analytics/tracking/plain_events",
  },
  fields: [{ name: "event_id", type: "String", options: { required: true } }],
}

/**
 * Endpoint definition with validations but mutation disabled.
 */
const validationsNoMutationDefinition: EndpointDefinitionFormat = {
  version: "1.0",
  tableName: "query_only",
  catalog: "analytics",
  schema: "tracking",
  fields: [
    {
      name: "email",
      type: "String",
      options: { required: true, validations: [{ type: "email" }] },
    },
  ],
}

describe("generateEndpoint validations + mutation", () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = path.join(
      tmpdir(),
      `gen-validations-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
  })

  afterEach(async () => {
    if (existsSync(outputDir)) {
      await rm(outputDir, { force: true, recursive: true })
    }
  })

  it("writes validations.ts alongside mutation-schema.ts", async () => {
    const result = await generateEndpoint({
      definition: validatedDefinition,
      outputDir,
      skipRegistry: true,
    })

    const fileNames = result.files.map((f) => f.fileName)
    expect(fileNames).toContain("mutation-schema.ts")
    expect(fileNames).toContain("validations.ts")
    expect(existsSync(path.join(outputDir, "validations.ts"))).toBeTruthy()
  })

  it("mutation-schema.ts import of ./validations resolves to the written file", async () => {
    await generateEndpoint({
      definition: validatedDefinition,
      outputDir,
      skipRegistry: true,
    })

    const mutationSchema = await readFile(
      path.join(outputDir, "mutation-schema.ts"),
      "utf-8"
    )
    const validations = await readFile(
      path.join(outputDir, "validations.ts"),
      "utf-8"
    )

    // The mutation schema imports { validationSchema } from "./validations"
    expect(mutationSchema).toContain(
      'import { validationSchema } from "./validations"'
    )
    expect(mutationSchema).toContain("validationSchema.parse(record)")

    // The validations file exports the symbol the import expects
    expect(validations).toContain("export const validationSchema")
    expect(validations).toContain('import { z } from "zod"')
  })

  it("emits root field validations in validations.ts", async () => {
    await generateEndpoint({
      definition: validatedDefinition,
      outputDir,
      skipRegistry: true,
    })

    const validations = await readFile(
      path.join(outputDir, "validations.ts"),
      "utf-8"
    )

    expect(validations).toContain("email")
    expect(validations).toContain(".email()")
  })

  it("emits validations for fields nested inside an Object", async () => {
    await generateEndpoint({
      definition: validatedDefinition,
      outputDir,
      skipRegistry: true,
    })

    const validations = await readFile(
      path.join(outputDir, "validations.ts"),
      "utf-8"
    )

    expect(validations).toContain("metadata")
    expect(validations).toContain("homepage")
    expect(validations).toContain(".url()")
  })

  it("emits validations for fields nested inside an Array-of-Object", async () => {
    await generateEndpoint({
      definition: validatedDefinition,
      outputDir,
      skipRegistry: true,
    })

    const validations = await readFile(
      path.join(outputDir, "validations.ts"),
      "utf-8"
    )

    expect(validations).toContain("dimensions")
    // The emitted schema wraps the array across lines; collapse whitespace
    // before asserting on the structural shape.
    const collapsed = validations.replaceAll(/\s+/gu, "")
    expect(collapsed).toContain("dimensions:z.array(z.object(")
    expect(validations).toContain("key")
    expect(validations).toContain(".min(1)")
  })

  it("does not write validations.ts when no field has validations", async () => {
    const result = await generateEndpoint({
      definition: noValidationDefinition,
      outputDir,
      skipRegistry: true,
    })

    const fileNames = result.files.map((f) => f.fileName)
    expect(fileNames).toContain("mutation-schema.ts")
    expect(fileNames).not.toContain("validations.ts")
    expect(existsSync(path.join(outputDir, "validations.ts"))).toBeFalsy()

    // And the mutation schema must not reference the missing file
    const mutationSchema = await readFile(
      path.join(outputDir, "mutation-schema.ts"),
      "utf-8"
    )
    expect(mutationSchema).not.toContain("./validations")
  })

  it("does not write validations.ts when mutation is disabled", async () => {
    const result = await generateEndpoint({
      definition: validationsNoMutationDefinition,
      outputDir,
      skipRegistry: true,
    })

    const fileNames = result.files.map((f) => f.fileName)
    expect(fileNames).not.toContain("mutation-schema.ts")
    expect(fileNames).not.toContain("validations.ts")
    expect(existsSync(path.join(outputDir, "validations.ts"))).toBeFalsy()
  })
})
