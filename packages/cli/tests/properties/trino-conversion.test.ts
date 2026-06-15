// oxlint-disable typescript/no-non-null-assertion import/no-named-as-default-member
// Feature: custom-endpoint-cli, Property 10: Trino column conversion produces valid definitions

import type { JSONType } from "@lakeql/column-parser"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { endpointDefinitionSchema } from "../../src/pipeline/schema"
import { trinoColumnsToDefinition } from "../../src/pipeline/trino-to-definition"

// --- Type mapping reference ---

const TRINO_TO_FIELD_TYPE: Record<string, string> = {
  varchar: "String",
  integer: "Integer",
  bigint: "Integer",
  double: "Float",
  float: "Float",
  decimal: "Float",
  boolean: "Boolean",
  timestamp: "DateTime",
  date: "Date",
}

// --- Arbitraries ---

/** Generate a valid column/field name matching /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/ */
const columnNameArb = fc
  .tuple(
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz_"),
      minLength: 1,
      maxLength: 1,
    }),
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_"),
      minLength: 0,
      maxLength: 10,
    })
  )
  .map(([first, rest]: [string, string]) => first + rest)

/** Known Trino primitive type strings (including parameterized ones) */
const trinoPrimitiveTypes = [
  "varchar",
  "integer",
  "bigint",
  "double",
  "float",
  "boolean",
  "timestamp(3)",
  "timestamp(6)",
  "date",
  "decimal(10,2)",
  "decimal(38,18)",
] as const

const trinoPrimitiveTypeArb = fc.constantFrom(...trinoPrimitiveTypes)

/**
 * Generate a JSONType value representing Trino parsed columns.
 * Supports:
 * - Primitive strings (e.g., "varchar", "integer", "timestamp(3)")
 * - Arrays of primitives (e.g., ["varchar"])
 * - Arrays of objects (e.g., [{ key: "varchar" }])
 * - Nested objects (e.g., { street: "varchar", zip: "integer" })
 */
function jsonTypeArb(maxDepth: number): fc.Arbitrary<JSONType> {
  if (maxDepth <= 0) {
    return trinoPrimitiveTypeArb
  }

  const primitiveArb: fc.Arbitrary<JSONType> = trinoPrimitiveTypeArb

  const objectArb: fc.Arbitrary<JSONType> = fc
    .array(fc.tuple(columnNameArb, jsonTypeArb(maxDepth - 1)), {
      minLength: 1,
      maxLength: 4,
    })
    .map((entries) => {
      // Deduplicate keys
      const obj: Record<string, JSONType> = {}
      for (const [key, value] of entries) {
        if (!(key in obj)) {
          obj[key] = value
        }
      }
      return obj
    })

  const arrayPrimitiveArb: fc.Arbitrary<JSONType> = trinoPrimitiveTypeArb.map(
    (t) => [t] as JSONType[]
  )

  const arrayObjectArb: fc.Arbitrary<JSONType> = fc
    .array(
      fc.tuple(columnNameArb, trinoPrimitiveTypeArb as fc.Arbitrary<JSONType>),
      { minLength: 1, maxLength: 3 }
    )
    .map((entries) => {
      const obj: Record<string, JSONType> = {}
      for (const [key, value] of entries) {
        if (!(key in obj)) {
          obj[key] = value
        }
      }
      return [obj] as JSONType[]
    })

  return fc.oneof(
    { weight: 4, arbitrary: primitiveArb },
    { weight: 2, arbitrary: objectArb },
    { weight: 1, arbitrary: arrayPrimitiveArb },
    { weight: 1, arbitrary: arrayObjectArb }
  )
}

/** Generate a valid parsedColumns Record<string, JSONType> with unique keys */
const parsedColumnsArb = fc
  .array(fc.tuple(columnNameArb, jsonTypeArb(2)), {
    minLength: 1,
    maxLength: 6,
  })
  .map((entries) => {
    const columns: Record<string, JSONType> = {}
    for (const [key, value] of entries) {
      if (!(key in columns)) {
        columns[key] = value
      }
    }
    return columns
  })

/** Generate valid metadata identifiers matching /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/ */
const metadataNameArb = fc
  .tuple(
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz_"),
      minLength: 1,
      maxLength: 1,
    }),
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_"),
      minLength: 0,
      maxLength: 15,
    })
  )
  .map(([first, rest]: [string, string]) => first + rest)

// --- Helper functions ---

/** Normalize a Trino type string to extract the base type name */
function normalizeTrinoType(trinoType: string): string {
  return trinoType.replaceAll(/[^a-zA-Z]/gu, "")
}

/** Get the expected field type for a Trino primitive type */
function expectedFieldType(trinoType: string): string {
  const normalized = normalizeTrinoType(trinoType)
  return TRINO_TO_FIELD_TYPE[normalized] ?? "String"
}

/** Count the number of unique keys in a parsedColumns record */
function countColumns(parsedColumns: Record<string, JSONType>): number {
  return Object.keys(parsedColumns).length
}

// --- Tests ---

describe("Property 10: Trino column conversion produces valid definitions", () => {
  it("trinoColumnsToDefinition output passes endpointDefinitionSchema validation", () => {
    fc.assert(
      fc.property(
        metadataNameArb,
        metadataNameArb,
        metadataNameArb,
        parsedColumnsArb,
        (tableName, catalog, schema, parsedColumns) => {
          const result = trinoColumnsToDefinition({
            tableName,
            catalog,
            schema,
            parsedColumns,
          })

          const validation = endpointDefinitionSchema.safeParse(result)
          expect(validation.success).toBeTruthy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("output fields array has the same number of entries as input columns", () => {
    fc.assert(
      fc.property(
        metadataNameArb,
        metadataNameArb,
        metadataNameArb,
        parsedColumnsArb,
        (tableName, catalog, schema, parsedColumns) => {
          const result = trinoColumnsToDefinition({
            tableName,
            catalog,
            schema,
            parsedColumns,
          })

          expect(result.fields).toHaveLength(countColumns(parsedColumns))
        }
      ),
      { numRuns: 100 }
    )
  })

  it("each field name matches the corresponding input column name", () => {
    fc.assert(
      fc.property(
        metadataNameArb,
        metadataNameArb,
        metadataNameArb,
        parsedColumnsArb,
        (tableName, catalog, schema, parsedColumns) => {
          const result = trinoColumnsToDefinition({
            tableName,
            catalog,
            schema,
            parsedColumns,
          })

          const inputColumnNames = Object.keys(parsedColumns)
          const outputFieldNames = result.fields.map((f) => f.name)

          expect(outputFieldNames.toSorted()).toStrictEqual(
            inputColumnNames.toSorted()
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it("primitive type mappings are correct for all known Trino types", () => {
    // Only test with primitive columns to verify type mappings directly
    const primitiveColumnsArb = fc
      .array(fc.tuple(columnNameArb, trinoPrimitiveTypeArb), {
        minLength: 1,
        maxLength: 6,
      })
      .map((entries) => {
        const columns: Record<string, JSONType> = {}
        for (const [key, value] of entries) {
          if (!(key in columns)) {
            columns[key] = value
          }
        }
        return columns
      })

    fc.assert(
      fc.property(
        metadataNameArb,
        metadataNameArb,
        metadataNameArb,
        primitiveColumnsArb,
        (tableName, catalog, schema, parsedColumns) => {
          const result = trinoColumnsToDefinition({
            tableName,
            catalog,
            schema,
            parsedColumns,
          })

          for (const field of result.fields) {
            const inputType = parsedColumns[field.name] as string
            const expected = expectedFieldType(inputType)
            expect(field.type).toBe(expected)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("array columns produce Array type fields with correct item types", () => {
    const arrayColumnsArb = fc
      .array(
        fc.tuple(
          columnNameArb,
          trinoPrimitiveTypeArb.map((t) => [t] as JSONType[])
        ),
        { minLength: 1, maxLength: 4 }
      )
      .map((entries) => {
        const columns: Record<string, JSONType> = {}
        for (const [key, value] of entries) {
          if (!(key in columns)) {
            columns[key] = value
          }
        }
        return columns
      })

    fc.assert(
      fc.property(
        metadataNameArb,
        metadataNameArb,
        metadataNameArb,
        arrayColumnsArb,
        (tableName, catalog, schema, parsedColumns) => {
          const result = trinoColumnsToDefinition({
            tableName,
            catalog,
            schema,
            parsedColumns,
          })

          for (const field of result.fields) {
            expect(field.type).toBe("Array")
            expect(field.items).toBeDefined()

            const inputArray = parsedColumns[field.name] as JSONType[]
            const itemType = inputArray[0] as string
            expect(field.items!.type).toBe(expectedFieldType(itemType))
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("object columns produce Object type fields with correct nested fields", () => {
    const objectColumnsArb = fc
      .array(
        fc.tuple(
          columnNameArb,
          fc
            .array(
              fc.tuple(
                columnNameArb,
                trinoPrimitiveTypeArb as fc.Arbitrary<JSONType>
              ),
              { minLength: 1, maxLength: 3 }
            )
            .map((entries) => {
              const obj: Record<string, JSONType> = {}
              for (const [key, value] of entries) {
                if (!(key in obj)) {
                  obj[key] = value
                }
              }
              return obj as JSONType
            })
        ),
        { minLength: 1, maxLength: 4 }
      )
      .map((entries) => {
        const columns: Record<string, JSONType> = {}
        for (const [key, value] of entries) {
          if (!(key in columns)) {
            columns[key] = value
          }
        }
        return columns
      })

    fc.assert(
      fc.property(
        metadataNameArb,
        metadataNameArb,
        metadataNameArb,
        objectColumnsArb,
        (tableName, catalog, schema, parsedColumns) => {
          const result = trinoColumnsToDefinition({
            tableName,
            catalog,
            schema,
            parsedColumns,
          })

          for (const field of result.fields) {
            expect(field.type).toBe("Object")
            expect(field.fields).toBeDefined()
            expect(field.fields!.length).toBeGreaterThan(0)

            const inputObj = parsedColumns[field.name] as Record<
              string,
              JSONType
            >
            const inputKeys = Object.keys(inputObj)
            const fieldNames = field.fields!.map((f) => f.name)

            expect(fieldNames.toSorted()).toStrictEqual(inputKeys.toSorted())

            // Verify nested type mappings
            for (const nestedField of field.fields!) {
              const nestedInputType = inputObj[nestedField.name] as string
              expect(nestedField.type).toBe(expectedFieldType(nestedInputType))
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("version is always '1.0' and metadata fields pass through unchanged", () => {
    fc.assert(
      fc.property(
        metadataNameArb,
        metadataNameArb,
        metadataNameArb,
        parsedColumnsArb,
        (tableName, catalog, schema, parsedColumns) => {
          const result = trinoColumnsToDefinition({
            tableName,
            catalog,
            schema,
            parsedColumns,
          })

          expect(result.version).toBe("1.0")
          expect(result.tableName).toBe(tableName)
          expect(result.catalog).toBe(catalog)
          expect(result.schema).toBe(schema)
        }
      ),
      { numRuns: 100 }
    )
  })
})
