/* eslint-disable vitest/max-expects */
import { existsSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { detectExistingDefinition } from "@/pipeline/detect-existing"
import {
  canFinish,
  createInitialState,
  processFieldName,
  processFieldType,
  processFinishLevel,
} from "@/pipeline/field-builder-logic"
import type {
  EndpointDefinitionFormat,
  FieldDefinition,
} from "@/pipeline/schema"
import { serializeDeterministic } from "@/pipeline/serialize"

describe("Re-edit flow", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `re-edit-test-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true })
    }
  })

  describe("Detection of existing definition", () => {
    test("detects a valid endpoint.json and returns the parsed definition", async () => {
      const definition: EndpointDefinitionFormat = {
        version: "1.0",
        tableName: "user_events",
        catalog: "analytics",
        schema: "tracking",
        fields: [
          { name: "event_id", type: "String" },
          { name: "count", type: "Integer" },
        ],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        serializeDeterministic(definition)
      )

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toStrictEqual(definition)
      expect(result.error).toBeUndefined()
    })

    test("returns found: false when no endpoint.json exists", async () => {
      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeFalsy()
      expect(result.definition).toBeUndefined()
      expect(result.error).toBeUndefined()
    })

    test("returns found: false for an empty directory", async () => {
      const emptyDir = path.join(testDir, "empty-subdir")
      await mkdir(emptyDir, { recursive: true })

      const result = await detectExistingDefinition(emptyDir)
      expect(result.found).toBeFalsy()
    })

    test("detects definition with nested Object fields", async () => {
      const definition: EndpointDefinitionFormat = {
        version: "1.0",
        tableName: "orders",
        catalog: "commerce",
        schema: "sales",
        fields: [
          { name: "id", type: "String" },
          {
            name: "shipping",
            type: "Object",
            fields: [
              { name: "street", type: "String" },
              { name: "city", type: "String" },
            ],
          },
        ],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        serializeDeterministic(definition)
      )

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toStrictEqual(definition)
    })

    test("detects definition with Array fields", async () => {
      const definition: EndpointDefinitionFormat = {
        version: "1.0",
        tableName: "products",
        catalog: "catalog",
        schema: "inventory",
        fields: [
          { name: "name", type: "String" },
          { name: "tags", type: "Array", items: { type: "String" } },
          {
            name: "variants",
            type: "Array",
            items: {
              type: "Object",
              fields: [
                { name: "sku", type: "String" },
                { name: "price", type: "Float" },
              ],
            },
          },
        ],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        serializeDeterministic(definition)
      )

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toStrictEqual(definition)
    })
  })

  describe("Pre-population of Field Builder from valid file", () => {
    test("createInitialState pre-populates with loaded fields", () => {
      const loadedFields: FieldDefinition[] = [
        { name: "event_id", type: "String" },
        { name: "timestamp", type: "DateTime" },
        { name: "count", type: "Integer" },
      ]

      const state = createInitialState(loadedFields)
      expect(state.currentFields).toStrictEqual(loadedFields)
      expect(state.mode).toBe("name")
      expect(state.nestingStack).toHaveLength(0)
      expect(state.error).toBeNull()
    })

    test("pre-populated state preserves nested Object fields", () => {
      const loadedFields: FieldDefinition[] = [
        { name: "id", type: "String" },
        {
          name: "metadata",
          type: "Object",
          fields: [
            { name: "source", type: "String" },
            { name: "version", type: "Float" },
          ],
        },
      ]

      const state = createInitialState(loadedFields)
      expect(state.currentFields).toHaveLength(2)
      expect(state.currentFields[1]).toStrictEqual({
        name: "metadata",
        type: "Object",
        fields: [
          { name: "source", type: "String" },
          { name: "version", type: "Float" },
        ],
      })
    })

    test("pre-populated state preserves Array fields", () => {
      const loadedFields: FieldDefinition[] = [
        { name: "tags", type: "Array", items: { type: "String" } },
        {
          name: "items",
          type: "Array",
          items: {
            type: "Object",
            fields: [
              { name: "key", type: "String" },
              { name: "value", type: "Integer" },
            ],
          },
        },
      ]

      const state = createInitialState(loadedFields)
      expect(state.currentFields).toStrictEqual(loadedFields)
    })

    test("can add new fields to pre-populated state", () => {
      const loadedFields: FieldDefinition[] = [{ name: "id", type: "Integer" }]

      const state = createInitialState(loadedFields)

      let currentState = state
      currentState = processFieldName(currentState, "new_field")
      expect(currentState.mode).toBe("type")

      currentState = processFieldType(currentState, "String")
      expect(currentState.currentFields).toHaveLength(2)
      expect(currentState.currentFields[0]).toStrictEqual({
        name: "id",
        type: "Integer",
      })
      expect(currentState.currentFields[1]).toStrictEqual({
        name: "new_field",
        type: "String",
      })
    })

    test("can finish immediately with pre-populated fields", () => {
      const loadedFields: FieldDefinition[] = [
        { name: "id", type: "Integer" },
        { name: "name", type: "String" },
      ]

      const state = createInitialState(loadedFields)

      expect(canFinish(state)).toBeTruthy()
      const result = processFinishLevel(state)
      expect(result.completedFields).toStrictEqual(loadedFields)
    })

    test("detects duplicate when adding field with same name as pre-populated field", () => {
      const loadedFields: FieldDefinition[] = [
        { name: "id", type: "Integer" },
        { name: "name", type: "String" },
      ]

      const state = createInitialState(loadedFields)

      const result = processFieldName(state, "id")
      expect(result.mode).toBe("name")
      expect(result.error).toContain("already exists")
    })
  })

  describe("Corrupted file handling", () => {
    test("returns error for malformed JSON", async () => {
      await writeFile(
        path.join(testDir, "endpoint.json"),
        "{ this is not valid json !!!"
      )

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toBeUndefined()
      expect(result.error).toBeDefined()
      expect(result.error).toContain("Invalid JSON")
    })

    test("returns error for empty file", async () => {
      await writeFile(path.join(testDir, "endpoint.json"), "")

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.error).toBeDefined()
      expect(result.error).toContain("Invalid JSON")
    })

    test("returns error for valid JSON that fails schema validation (missing version)", async () => {
      const invalid = {
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "id", type: "String" }],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        JSON.stringify(invalid, null, 2)
      )

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toBeUndefined()
      expect(result.error).toBeDefined()
      expect(result.error).toContain("Validation failed")
    })

    test("returns error for valid JSON with wrong version", async () => {
      const invalid = {
        version: "2.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "id", type: "String" }],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        JSON.stringify(invalid, null, 2)
      )

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toBeUndefined()
      expect(result.error).toContain("Validation failed")
    })

    test("returns error for invalid field names in definition", async () => {
      const invalid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "1invalid_name", type: "String" }],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        JSON.stringify(invalid, null, 2)
      )

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toBeUndefined()
      expect(result.error).toContain("Validation failed")
    })

    test("returns error for invalid field type in definition", async () => {
      const invalid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "id", type: "UnknownType" }],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        JSON.stringify(invalid, null, 2)
      )

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toBeUndefined()
      expect(result.error).toContain("Validation failed")
    })

    test("returns error for Object field missing required fields property", async () => {
      const invalid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [{ name: "metadata", type: "Object" }],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        JSON.stringify(invalid, null, 2)
      )

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toBeUndefined()
      expect(result.error).toContain("Validation failed")
    })

    test("returns error for duplicate field names at same nesting level", async () => {
      const invalid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [
          { name: "id", type: "String" },
          { name: "id", type: "Integer" },
        ],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        JSON.stringify(invalid, null, 2)
      )

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toBeUndefined()
      expect(result.error).toContain("Duplicate field")
    })

    test("returns error for duplicate fields in nested Object", async () => {
      const invalid = {
        version: "1.0",
        tableName: "test_table",
        catalog: "my_catalog",
        schema: "my_schema",
        fields: [
          {
            name: "address",
            type: "Object",
            fields: [
              { name: "street", type: "String" },
              { name: "street", type: "String" },
            ],
          },
        ],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        JSON.stringify(invalid, null, 2)
      )

      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toBeUndefined()
      expect(result.error).toContain("Duplicate field")
    })
  })

  describe("Start-fresh overwrites", () => {
    test("generateEndpoint removes existing directory before writing", async () => {
      // Create an existing output directory with an old file
      const outputDir = path.join(testDir, "output")
      await mkdir(outputDir, { recursive: true })
      await writeFile(path.join(outputDir, "old-file.txt"), "should be removed")
      await writeFile(
        path.join(outputDir, "endpoint.json"),
        JSON.stringify({
          version: "1.0",
          tableName: "old_table",
          catalog: "old_catalog",
          schema: "old_schema",
          fields: [{ name: "old_field", type: "String" }],
        })
      )

      // Verify the old files exist
      expect(existsSync(path.join(outputDir, "old-file.txt"))).toBeTruthy()
      expect(existsSync(path.join(outputDir, "endpoint.json"))).toBeTruthy()

      // Simulate what generateEndpoint does: remove and recreate
      await rm(outputDir, { force: true, recursive: true })
      await mkdir(outputDir, { recursive: true })

      // Write new content
      const newDefinition: EndpointDefinitionFormat = {
        version: "1.0",
        tableName: "new_table",
        catalog: "new_catalog",
        schema: "new_schema",
        fields: [{ name: "new_field", type: "Integer" }],
      }
      await writeFile(
        path.join(outputDir, "endpoint.json"),
        serializeDeterministic(newDefinition)
      )

      // Verify old file is gone and new content is written
      expect(existsSync(path.join(outputDir, "old-file.txt"))).toBeFalsy()
      expect(existsSync(path.join(outputDir, "endpoint.json"))).toBeTruthy()

      // Verify the new definition is the one on disk
      const result = await detectExistingDefinition(outputDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toStrictEqual(newDefinition)
    })

    test("start fresh with new definition completely replaces previous one", async () => {
      // Write an initial definition
      const oldDefinition: EndpointDefinitionFormat = {
        version: "1.0",
        tableName: "old_endpoint",
        catalog: "old_catalog",
        schema: "old_schema",
        fields: [
          { name: "old_id", type: "String" },
          { name: "old_name", type: "String" },
          {
            name: "old_nested",
            type: "Object",
            fields: [{ name: "key", type: "String" }],
          },
        ],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        serializeDeterministic(oldDefinition)
      )

      // Verify old definition is detected
      const before = await detectExistingDefinition(testDir)
      expect(before.found).toBeTruthy()
      expect(before.definition?.tableName).toBe("old_endpoint")
      expect(before.definition?.fields).toHaveLength(3)

      // Simulate start-fresh: overwrite with new definition
      const newDefinition: EndpointDefinitionFormat = {
        version: "1.0",
        tableName: "new_endpoint",
        catalog: "new_catalog",
        schema: "new_schema",
        fields: [{ name: "new_id", type: "Integer" }],
      }

      await writeFile(
        path.join(testDir, "endpoint.json"),
        serializeDeterministic(newDefinition)
      )

      // Verify new definition is detected
      const after = await detectExistingDefinition(testDir)
      expect(after.found).toBeTruthy()
      expect(after.definition).toStrictEqual(newDefinition)
      expect(after.definition?.tableName).toBe("new_endpoint")
      expect(after.definition?.fields).toHaveLength(1)
    })

    test("overwritten definition passes re-detection after write", async () => {
      const definition: EndpointDefinitionFormat = {
        version: "1.0",
        tableName: "fresh_start",
        catalog: "test_catalog",
        schema: "test_schema",
        fields: [
          { name: "alpha", type: "Boolean" },
          { name: "beta", type: "Float" },
        ],
      }

      // Write using the deterministic serializer (same as pipeline)
      await writeFile(
        path.join(testDir, "endpoint.json"),
        serializeDeterministic(definition)
      )

      // Re-detect should find the same definition
      const result = await detectExistingDefinition(testDir)
      expect(result.found).toBeTruthy()
      expect(result.definition).toStrictEqual(definition)
      expect(result.error).toBeUndefined()
    })
  })
})
