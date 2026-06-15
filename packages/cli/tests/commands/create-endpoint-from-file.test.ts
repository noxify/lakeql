// oxlint-disable vitest/no-conditional-expect
// oxlint-disable vitest/require-to-throw-message
import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, test } from "vitest"

import {
  endpointDefinitionSchema,
  findDuplicateFieldNames,
} from "../../src/pipeline/schema"

describe("create-endpoint --from-file validation", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `from-file-test-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true })
    }
  })

  describe("JSON parse errors", () => {
    test("invalid JSON is detected", () => {
      const badJson = "{ not valid json"
      expect(() => JSON.parse(badJson)).toThrow("JSON")
    })

    test("empty string is invalid JSON", () => {
      expect(() => JSON.parse("")).toThrow("Unexpected end")
    })
  })

  describe("schema validation", () => {
    test("valid definition passes validation", () => {
      const valid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "id", type: "String" }],
      }

      const result = endpointDefinitionSchema.safeParse(valid)
      expect(result.success).toBeTruthy()
    })

    test("missing version fails validation", () => {
      const invalid = {
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "id", type: "String" }],
      }

      const result = endpointDefinitionSchema.safeParse(invalid)
      expect(result.success).toBeFalsy()
    })

    test("wrong version value fails validation", () => {
      const invalid = {
        version: "2.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "id", type: "String" }],
      }

      const result = endpointDefinitionSchema.safeParse(invalid)
      expect(result.success).toBeFalsy()
    })

    test("invalid tableName (leading digit) fails validation", () => {
      const invalid = {
        version: "1.0",
        tableName: "1invalid",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "id", type: "String" }],
      }

      const result = endpointDefinitionSchema.safeParse(invalid)
      expect(result.success).toBeFalsy()
    })

    test("invalid field type fails validation", () => {
      const invalid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "id", type: "InvalidType" }],
      }

      const result = endpointDefinitionSchema.safeParse(invalid)
      expect(result.success).toBeFalsy()
    })

    test("invalid field name (has spaces) fails validation", () => {
      const invalid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "invalid name", type: "String" }],
      }

      const result = endpointDefinitionSchema.safeParse(invalid)
      expect(result.success).toBeFalsy()
    })

    test("Object field without fields property fails validation", () => {
      const invalid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "obj", type: "Object" }],
      }

      const result = endpointDefinitionSchema.safeParse(invalid)
      expect(result.success).toBeFalsy()
    })

    test("Object field with empty fields array fails validation", () => {
      const invalid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "obj", type: "Object", fields: [] }],
      }

      const result = endpointDefinitionSchema.safeParse(invalid)
      expect(result.success).toBeFalsy()
    })

    test("Array field with valid items passes validation", () => {
      const valid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "tags", type: "Array", items: { type: "String" } }],
      }

      const result = endpointDefinitionSchema.safeParse(valid)
      expect(result.success).toBeTruthy()
    })

    test("nested Object within Array passes validation", () => {
      const valid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [
          {
            name: "items",
            type: "Array",
            items: {
              type: "Object",
              fields: [{ name: "key", type: "String" }],
            },
          },
        ],
      }

      const result = endpointDefinitionSchema.safeParse(valid)
      expect(result.success).toBeTruthy()
    })
  })

  describe("duplicate field detection", () => {
    test("detects duplicate fields at root level", () => {
      const fields = [
        { name: "id", type: "String" as const },
        { name: "name", type: "String" as const },
        { name: "id", type: "Integer" as const },
      ]

      const duplicates = findDuplicateFieldNames(fields)
      expect(duplicates).toHaveLength(1)
      expect(duplicates[0]).toStrictEqual({ name: "id", path: [] })
    })

    test("detects duplicate fields in nested object", () => {
      const fields = [
        {
          name: "address",
          type: "Object" as const,
          fields: [
            { name: "street", type: "String" as const },
            { name: "street", type: "String" as const },
          ],
        },
      ]

      const duplicates = findDuplicateFieldNames(fields)
      expect(duplicates).toHaveLength(1)
      expect(duplicates[0]).toStrictEqual({ name: "street", path: ["address"] })
    })

    test("no duplicates returns empty array", () => {
      const fields = [
        { name: "id", type: "String" as const },
        { name: "name", type: "String" as const },
      ]

      const duplicates = findDuplicateFieldNames(fields)
      expect(duplicates).toHaveLength(0)
    })
  })

  describe("error message formatting", () => {
    test("schema validation errors include field paths", () => {
      const invalid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "1bad", type: "String" }],
      }

      const result = endpointDefinitionSchema.safeParse(invalid)
      expect(result.success).toBeFalsy()
      if (!result.success) {
        const { issues } = result.error
        expect(issues.length).toBeGreaterThan(0)
        // The error should reference the fields path
        const hasFieldPath = issues.some((issue) => issue.path.length > 0)
        expect(hasFieldPath).toBeTruthy()
      }
    })
  })

  describe("file not found handling", () => {
    test("non-existent file path is detected via existsSync", () => {
      const nonExistentPath = path.join(testDir, "does-not-exist.json")
      expect(existsSync(nonExistentPath)).toBeFalsy()
    })

    test("reading a non-existent file throws an error", async () => {
      const nonExistentPath = path.join(testDir, "missing.json")
      await expect(readFile(nonExistentPath, "utf-8")).rejects.toThrow("ENOENT")
    })
  })

  describe("valid definition file loading", () => {
    test("a complete valid definition file is parsed and validated successfully", async () => {
      const validDefinition = {
        version: "1.0",
        tableName: "user_events",
        catalog: "analytics",
        schema: "tracking",
        fields: [
          { name: "event_id", type: "String" },
          { name: "timestamp", type: "DateTime" },
          { name: "user_count", type: "Integer" },
          {
            name: "metadata",
            type: "Object",
            fields: [
              { name: "source", type: "String" },
              { name: "version", type: "Float" },
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
                { name: "value", type: "String" },
              ],
            },
          },
        ],
      }

      // Write to a file (simulating --from-file input)
      const filePath = path.join(testDir, "valid-endpoint.json")
      await writeFile(filePath, JSON.stringify(validDefinition, null, 2))

      // Read and parse
      const content = await readFile(filePath, "utf-8")
      const parsed = JSON.parse(content)

      // Validate schema
      const result = endpointDefinitionSchema.safeParse(parsed)
      expect(result.success).toBeTruthy()

      // Validate no duplicates
      if (result.success) {
        const duplicates = findDuplicateFieldNames(result.data.fields)
        expect(duplicates).toHaveLength(0)
      }
    })
  })
})
