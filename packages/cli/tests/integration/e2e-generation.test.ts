/* eslint-disable vitest/max-expects */
// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable unicorn/no-useless-undefined
import { existsSync } from "node:fs"
import { readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EndpointDefinitionFormat } from "@/pipeline/schema"

// Mock the config-registry to avoid env/config dependencies
vi.mock(import("@/commands/config-registry"), () => ({
  runConfigRegistryGeneration: vi.fn().mockResolvedValue(undefined),
  default: vi.fn(),
}))

// Must import generateEndpoint after mock is set up
const { generateEndpoint } = await import("@/pipeline/generate")

/**
 * Complex endpoint definition exercising all primitive types, nested objects, and arrays.
 */
const complexDefinition: EndpointDefinitionFormat = {
  version: "1.0",
  tableName: "user_events",
  catalog: "analytics",
  schema: "tracking",
  fields: [
    { name: "event_id", type: "String" },
    { name: "timestamp", type: "DateTime" },
    { name: "event_date", type: "Date" },
    { name: "user_count", type: "Integer" },
    { name: "score", type: "Float" },
    { name: "is_active", type: "Boolean" },
    {
      name: "metadata",
      type: "Object",
      fields: [
        { name: "source", type: "String" },
        { name: "priority", type: "Integer" },
        {
          name: "nested_obj",
          type: "Object",
          fields: [
            { name: "deep_field", type: "String" },
            { name: "deep_flag", type: "Boolean" },
          ],
        },
      ],
    },
    {
      name: "tags",
      type: "Array",
      items: { type: "String" },
    },
    {
      name: "dimensions",
      type: "Array",
      items: {
        type: "Object",
        fields: [
          { name: "key", type: "String" },
          { name: "value", type: "Float" },
        ],
      },
    },
  ],
}

describe("end-to-end generation (integration)", () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = path.join(
      tmpdir(),
      `e2e-gen-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
  })

  afterEach(async () => {
    if (existsSync(outputDir)) {
      await rm(outputDir, { force: true, recursive: true })
    }
  })

  describe("all 6 output files are written correctly", () => {
    it("should generate all 6 expected files for a complex definition", async () => {
      await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      const expectedFiles = [
        "config.ts",
        "interface.ts",
        "query-schema.ts",
        "mutation-schema.ts",
        "json-schema.json",
        "endpoint.json",
      ]

      for (const fileName of expectedFiles) {
        expect(
          existsSync(path.join(outputDir, fileName)),
          `Expected ${fileName} to exist in output directory`
        ).toBeTruthy()
      }
    })
  })

  describe("config.ts exports hiveConfig with correct metadata", () => {
    it("should export hiveConfig with catalog, schema, and tableName", async () => {
      await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      const configContent = await readFile(
        path.join(outputDir, "config.ts"),
        "utf-8"
      )

      // Verify hiveConfig export
      expect(configContent).toContain("hiveConfig")

      // Verify catalog, schema, tableName values are present
      expect(configContent).toContain("analytics")
      expect(configContent).toContain("tracking")
      expect(configContent).toContain("user_events")
    })
  })

  describe("config.ts is discoverable by config-registry globby pattern", () => {
    it("should be located at a path matching schemas/**/config.ts", async () => {
      // Build output dir following the expected convention:
      // schemas/generated/{catalog}/{schema}/{tableName}/
      const registryOutputDir = path.join(
        outputDir,
        "schemas",
        "generated",
        complexDefinition.catalog,
        complexDefinition.schema,
        complexDefinition.tableName
      )

      await generateEndpoint({
        definition: complexDefinition,
        outputDir: registryOutputDir,
        skipRegistry: true,
      })

      // The config.ts is at schemas/generated/analytics/tracking/user_events/config.ts
      // which matches the globby pattern schemas/**/config.ts relative to outputDir
      const configPath = path.join(registryOutputDir, "config.ts")
      expect(existsSync(configPath)).toBeTruthy()

      // Verify the relative path from the parent "schemas" dir matches the globby pattern
      const schemasRoot = path.join(outputDir, "schemas")
      const relativePath = path.relative(schemasRoot, configPath)
      // relativePath should be something like: generated/analytics/tracking/user_events/config.ts
      // which matches **/config.ts
      expect(relativePath).toMatch(/config\.ts$/u)
      expect(relativePath).toContain(path.sep)
    })
  })

  describe("interface.ts contains TypeScript interface declarations", () => {
    it("should contain export interface declarations", async () => {
      await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      const interfaceContent = await readFile(
        path.join(outputDir, "interface.ts"),
        "utf-8"
      )

      expect(interfaceContent).toContain("export interface")
    })
  })

  describe("query-schema.ts contains builder.queryFields", () => {
    it("should contain builder.queryFields call", async () => {
      await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      const querySchemaContent = await readFile(
        path.join(outputDir, "query-schema.ts"),
        "utf-8"
      )

      expect(querySchemaContent).toContain("builder.queryFields")
    })
  })

  describe("mutation-schema.ts contains builder.mutationFields and builder.inputType", () => {
    it("should contain builder.mutationFields call", async () => {
      await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      const mutationSchemaContent = await readFile(
        path.join(outputDir, "mutation-schema.ts"),
        "utf-8"
      )

      expect(mutationSchemaContent).toContain("builder.mutationFields")
    })

    it("should contain builder.inputType declaration", async () => {
      await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      const mutationSchemaContent = await readFile(
        path.join(outputDir, "mutation-schema.ts"),
        "utf-8"
      )

      expect(mutationSchemaContent).toContain("builder.inputType")
    })
  })

  describe("json-schema.json is valid JSON Schema Draft-07", () => {
    it("should be valid JSON with $schema pointing to draft-07", async () => {
      await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      const jsonSchemaContent = await readFile(
        path.join(outputDir, "json-schema.json"),
        "utf-8"
      )

      const parsed = JSON.parse(jsonSchemaContent)

      expect(parsed.$schema).toBe("https://json-schema.org/draft-07/schema#")
      expect(parsed.type).toBe("object")
      expect(parsed.properties).toBeDefined()
      expect(parsed.additionalProperties).toBeFalsy()
    })

    it("should contain properties matching the input field definitions", async () => {
      await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      const jsonSchemaContent = await readFile(
        path.join(outputDir, "json-schema.json"),
        "utf-8"
      )

      const parsed = JSON.parse(jsonSchemaContent)

      // Verify top-level fields are present
      expect(parsed.properties.event_id).toBeDefined()
      expect(parsed.properties.timestamp).toBeDefined()
      expect(parsed.properties.user_count).toBeDefined()
      expect(parsed.properties.score).toBeDefined()
      expect(parsed.properties.is_active).toBeDefined()
      expect(parsed.properties.metadata).toBeDefined()
      expect(parsed.properties.tags).toBeDefined()
      expect(parsed.properties.dimensions).toBeDefined()

      // Verify type mappings
      expect(parsed.properties.event_id.type).toBe("string")
      expect(parsed.properties.user_count.type).toBe("integer")
      expect(parsed.properties.score.type).toBe("number")
      expect(parsed.properties.is_active.type).toBe("boolean")
      expect(parsed.properties.timestamp.format).toBe("date-time")
      expect(parsed.properties.event_date.format).toBe("date")

      // Verify nested object
      expect(parsed.properties.metadata.type).toBe("object")
      expect(parsed.properties.metadata.additionalProperties).toBeFalsy()

      // Verify array of primitives
      expect(parsed.properties.tags.type).toBe("array")
      expect(parsed.properties.tags.items.type).toBe("string")

      // Verify array of objects
      expect(parsed.properties.dimensions.type).toBe("array")
      expect(parsed.properties.dimensions.items.type).toBe("object")
    })
  })

  describe("endpoint.json matches the input definition", () => {
    it("should be valid JSON matching the input definition", async () => {
      await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      const customEndpointContent = await readFile(
        path.join(outputDir, "endpoint.json"),
        "utf-8"
      )

      const parsed = JSON.parse(customEndpointContent)

      expect(parsed.version).toBe("1.0")
      expect(parsed.tableName).toBe("user_events")
      expect(parsed.catalog).toBe("analytics")
      expect(parsed.schema).toBe("tracking")
      expect(parsed.fields).toHaveLength(complexDefinition.fields.length)
    })

    it("should preserve nested object structure in endpoint.json", async () => {
      await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      const customEndpointContent = await readFile(
        path.join(outputDir, "endpoint.json"),
        "utf-8"
      )

      const parsed = JSON.parse(customEndpointContent)

      // Verify nested object
      const metadataField = parsed.fields.find(
        (f: { name: string }) => f.name === "metadata"
      )
      expect(metadataField).toBeDefined()
      expect(metadataField.type).toBe("Object")
      expect(metadataField.fields).toHaveLength(3)

      // Verify deeply nested object
      const nestedObj = metadataField.fields.find(
        (f: { name: string }) => f.name === "nested_obj"
      )
      expect(nestedObj).toBeDefined()
      expect(nestedObj.type).toBe("Object")
      expect(nestedObj.fields).toHaveLength(2)

      // Verify array of primitives
      const tagsField = parsed.fields.find(
        (f: { name: string }) => f.name === "tags"
      )
      expect(tagsField).toBeDefined()
      expect(tagsField.type).toBe("Array")
      expect(tagsField.items.type).toBe("String")

      // Verify array of objects
      const dimensionsField = parsed.fields.find(
        (f: { name: string }) => f.name === "dimensions"
      )
      expect(dimensionsField).toBeDefined()
      expect(dimensionsField.type).toBe("Array")
      expect(dimensionsField.items.type).toBe("Object")
      expect(dimensionsField.items.fields).toHaveLength(2)
    })
  })

  describe("complex definition with all primitive types", () => {
    it("should successfully generate all files without errors", async () => {
      const result = await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      // Verify the result contains all expected files
      expect(result.files.length).toBeGreaterThanOrEqual(6)
      expect(result.outputDir).toBe(outputDir)

      // Verify file names in the result
      const fileNames = result.files.map((f) => f.fileName)
      expect(fileNames).toContain("config.ts")
      expect(fileNames).toContain("interface.ts")
      expect(fileNames).toContain("query-schema.ts")
      expect(fileNames).toContain("mutation-schema.ts")
      expect(fileNames).toContain("json-schema.json")
      expect(fileNames).toContain("endpoint.json")
    })

    it("should generate non-empty content for all files", async () => {
      const result = await generateEndpoint({
        definition: complexDefinition,
        outputDir,
        skipRegistry: true,
      })

      for (const file of result.files) {
        expect(
          file.content.length,
          `Expected ${file.fileName} to have non-empty content`
        ).toBeGreaterThan(0)
      }
    })
  })
})
