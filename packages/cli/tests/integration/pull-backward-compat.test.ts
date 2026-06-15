// oxlint-disable vitest/max-expects
// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable typescript/no-non-null-assertion
import { existsSync } from "node:fs"
import { readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import type { JSONType } from "@lakeql/column-parser"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { endpointDefinitionSchema } from "@/pipeline/schema"
import { trinoColumnsToDefinition } from "@/pipeline/trino-to-definition"

// Mock the config-registry to avoid transitive env/options import
vi.mock(import("@/commands/config-registry"), () => ({
  runConfigRegistryGeneration: vi.fn().mockResolvedValue(null),
  default: vi.fn(),
}))

// Must import generateEndpoint after mock is set up
const { generateEndpoint } = await import("@/pipeline/generate")

/**
 * Fixture representing typical `parseColumns` output from a Trino table.
 * Includes primitive types, nested objects, and arrays to exercise
 * the full pipeline end-to-end.
 */
const typicalParsedColumns: Record<string, JSONType> = {
  order_id: "varchar",
  total_amount: "decimal(10,2)",
  quantity: "integer",
  created_at: "timestamp(3)",
  shipped_date: "date",
  is_active: "boolean",
  metadata: {
    source: "varchar",
    priority: "integer",
  },
  tags: ["varchar"],
  line_items: [
    {
      product_name: "varchar",
      unit_price: "double",
      qty: "integer",
    },
  ],
}

describe("pull backward compatibility (integration)", () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = path.join(
      tmpdir(),
      `pull-backward-compat-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
  })

  afterEach(async () => {
    if (existsSync(outputDir)) {
      await rm(outputDir, { force: true, recursive: true })
    }
  })

  describe("pipeline produces all expected output files", () => {
    it("should generate config.ts, interface.ts, query-schema.ts, json-schema.json, and endpoint.json", async () => {
      const definition = trinoColumnsToDefinition({
        tableName: "orders",
        catalog: "commerce",
        schema: "sales",
        parsedColumns: typicalParsedColumns,
      })

      await generateEndpoint({
        definition,
        outputDir,
        skipRegistry: true,
      })

      const expectedFiles = [
        "config.ts",
        "interface.ts",
        "query-schema.ts",
        "json-schema.json",
        "endpoint.json",
      ]

      for (const fileName of expectedFiles) {
        expect(
          existsSync(path.join(outputDir, fileName)),
          `Expected ${fileName} to exist in output directory`
        ).toBeTruthy()
      }

      // mutation-schema.ts should NOT be generated when mutation is false (pulled endpoints)
      expect(
        existsSync(path.join(outputDir, "mutation-schema.ts")),
        "mutation-schema.ts should NOT be generated when mutation is false"
      ).toBeFalsy()
    })
  })

  describe("endpoint.json validates against endpointDefinitionSchema", () => {
    it("should produce a valid endpoint.json for a simple table", async () => {
      const simpleParsedColumns: Record<string, JSONType> = {
        id: "varchar",
        name: "varchar",
        count: "integer",
      }

      const definition = trinoColumnsToDefinition({
        tableName: "simple_table",
        catalog: "test_catalog",
        schema: "test_schema",
        parsedColumns: simpleParsedColumns,
      })

      await generateEndpoint({
        definition,
        outputDir,
        skipRegistry: true,
      })

      const content = await readFile(
        path.join(outputDir, "endpoint.json"),
        "utf-8"
      )
      const parsed = JSON.parse(content)

      const result = endpointDefinitionSchema.safeParse(parsed)
      expect(result.success).toBeTruthy()

      // Verify key structural properties
      expect(parsed.version).toBe("1.0")
      expect(parsed.tableName).toBe("simple_table")
      expect(parsed.catalog).toBe("test_catalog")
      expect(parsed.schema).toBe("test_schema")
      expect(parsed.fields).toHaveLength(3)
    })

    it("should produce a valid endpoint.json for a complex table with nested types", async () => {
      const definition = trinoColumnsToDefinition({
        tableName: "orders",
        catalog: "commerce",
        schema: "sales",
        parsedColumns: typicalParsedColumns,
      })

      await generateEndpoint({
        definition,
        outputDir,
        skipRegistry: true,
      })

      const content = await readFile(
        path.join(outputDir, "endpoint.json"),
        "utf-8"
      )
      const parsed = JSON.parse(content)

      const result = endpointDefinitionSchema.safeParse(parsed)
      expect(result.success).toBeTruthy()

      // Verify nested structures are preserved
      const metadataField = parsed.fields.find(
        (f: { name: string }) => f.name === "metadata"
      )
      expect(metadataField).toBeDefined()
      expect(metadataField.type).toBe("Object")
      expect(metadataField.fields).toHaveLength(2)

      const tagsField = parsed.fields.find(
        (f: { name: string }) => f.name === "tags"
      )
      expect(tagsField).toBeDefined()
      expect(tagsField.type).toBe("Array")
      expect(tagsField.items.type).toBe("String")

      const lineItemsField = parsed.fields.find(
        (f: { name: string }) => f.name === "line_items"
      )
      expect(lineItemsField).toBeDefined()
      expect(lineItemsField.type).toBe("Array")
      expect(lineItemsField.items.type).toBe("Object")
      expect(lineItemsField.items.fields).toHaveLength(3)
    })
  })

  describe("config.ts contains expected patterns", () => {
    it("should export hiveConfig with catalog, schema, and tableName", async () => {
      const definition = trinoColumnsToDefinition({
        tableName: "orders",
        catalog: "commerce",
        schema: "sales",
        parsedColumns: typicalParsedColumns,
      })

      await generateEndpoint({
        definition,
        outputDir,
        skipRegistry: true,
      })

      const configContent = await readFile(
        path.join(outputDir, "config.ts"),
        "utf-8"
      )

      // Verify hiveConfig export exists
      expect(configContent).toContain("hiveConfig")

      // Verify catalog, schema, and tableName are present in the config
      expect(configContent).toContain("commerce")
      expect(configContent).toContain("sales")
      expect(configContent).toContain("orders")
    })

    it("should include the catalog value in config.ts for different catalogs", async () => {
      const columns: Record<string, JSONType> = { id: "varchar" }

      const definition = trinoColumnsToDefinition({
        tableName: "metrics",
        catalog: "analytics_prod",
        schema: "reporting",
        parsedColumns: columns,
      })

      await generateEndpoint({
        definition,
        outputDir,
        skipRegistry: true,
      })

      const configContent = await readFile(
        path.join(outputDir, "config.ts"),
        "utf-8"
      )

      expect(configContent).toContain("hiveConfig")
      expect(configContent).toContain("analytics_prod")
      expect(configContent).toContain("reporting")
      expect(configContent).toContain("metrics")
    })
  })

  describe("interface.ts contains expected patterns", () => {
    it("should contain export interface declaration", async () => {
      const definition = trinoColumnsToDefinition({
        tableName: "orders",
        catalog: "commerce",
        schema: "sales",
        parsedColumns: typicalParsedColumns,
      })

      await generateEndpoint({
        definition,
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

  describe("query-schema.ts contains expected patterns", () => {
    it("should contain builder.queryFields", async () => {
      const definition = trinoColumnsToDefinition({
        tableName: "orders",
        catalog: "commerce",
        schema: "sales",
        parsedColumns: typicalParsedColumns,
      })

      await generateEndpoint({
        definition,
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

  describe("mutation-schema.ts is generated when mutation config is present", () => {
    it("should contain builder.mutationFields when mutation config is provided", async () => {
      const definition = trinoColumnsToDefinition({
        tableName: "orders",
        catalog: "commerce",
        schema: "sales",
        parsedColumns: typicalParsedColumns,
      })

      // Override mutation to be a valid config object
      const definitionWithMutation = {
        ...definition,
        mutation: {
          loadStrategy: "full_load" as const,
          basePath: "warehouse/sales/orders",
        },
      }

      await generateEndpoint({
        definition: definitionWithMutation,
        outputDir,
        skipRegistry: true,
      })

      const mutationSchemaContent = await readFile(
        path.join(outputDir, "mutation-schema.ts"),
        "utf-8"
      )

      expect(mutationSchemaContent).toContain("builder.mutationFields")
      expect(mutationSchemaContent).toContain("executeWritePipeline")
    })

    it("should NOT generate mutation-schema.ts when mutation is false (pulled endpoints)", async () => {
      const definition = trinoColumnsToDefinition({
        tableName: "orders",
        catalog: "commerce",
        schema: "sales",
        parsedColumns: typicalParsedColumns,
      })

      await generateEndpoint({
        definition,
        outputDir,
        skipRegistry: true,
      })

      expect(existsSync(path.join(outputDir, "mutation-schema.ts"))).toBeFalsy()
    })
  })

  describe("endpoint.json is usable as --from-file input", () => {
    it("should produce output that can be re-parsed and fed back to generateEndpoint", async () => {
      const definition = trinoColumnsToDefinition({
        tableName: "orders",
        catalog: "commerce",
        schema: "sales",
        parsedColumns: typicalParsedColumns,
      })

      // First generation (simulates pull command)
      await generateEndpoint({
        definition,
        outputDir,
        skipRegistry: true,
      })

      // Read the generated endpoint.json
      const customEndpointPath = path.join(outputDir, "endpoint.json")
      const content = await readFile(customEndpointPath, "utf-8")
      const loadedDefinition = JSON.parse(content)

      // Validate it (as --from-file would)
      const validationResult =
        endpointDefinitionSchema.safeParse(loadedDefinition)
      expect(validationResult.success).toBeTruthy()

      // Re-generate from the loaded definition (simulates create-endpoint --from-file)
      const secondOutputDir = `${outputDir}-reuse`
      try {
        await generateEndpoint({
          definition: validationResult.data!,
          outputDir: secondOutputDir,
          skipRegistry: true,
        })

        // Verify second generation produced all expected files
        const expectedFiles = [
          "config.ts",
          "interface.ts",
          "query-schema.ts",
          "json-schema.json",
          "endpoint.json",
        ]

        for (const fileName of expectedFiles) {
          expect(
            existsSync(path.join(secondOutputDir, fileName)),
            `Expected ${fileName} to exist in second output`
          ).toBeTruthy()
        }

        // Verify endpoint.json from second run is byte-identical to first
        const secondContent = await readFile(
          path.join(secondOutputDir, "endpoint.json"),
          "utf-8"
        )
        expect(secondContent).toBe(content)
      } finally {
        if (existsSync(secondOutputDir)) {
          await rm(secondOutputDir, { force: true, recursive: true })
        }
      }
    })

    it("should produce identical config.ts when re-generated from endpoint.json", async () => {
      const definition = trinoColumnsToDefinition({
        tableName: "orders",
        catalog: "commerce",
        schema: "sales",
        parsedColumns: typicalParsedColumns,
      })

      // First generation
      await generateEndpoint({
        definition,
        outputDir,
        skipRegistry: true,
      })

      const originalConfig = await readFile(
        path.join(outputDir, "config.ts"),
        "utf-8"
      )

      // Load and re-generate
      const customEndpointContent = await readFile(
        path.join(outputDir, "endpoint.json"),
        "utf-8"
      )
      const reloadedDef = endpointDefinitionSchema.parse(
        JSON.parse(customEndpointContent)
      )

      const secondOutputDir = `${outputDir}-config-check`
      try {
        await generateEndpoint({
          definition: reloadedDef,
          outputDir: secondOutputDir,
          skipRegistry: true,
        })

        const regeneratedConfig = await readFile(
          path.join(secondOutputDir, "config.ts"),
          "utf-8"
        )

        expect(regeneratedConfig).toBe(originalConfig)
      } finally {
        if (existsSync(secondOutputDir)) {
          await rm(secondOutputDir, { force: true, recursive: true })
        }
      }
    })
  })
})
