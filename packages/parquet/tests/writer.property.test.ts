// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects

import fc from "fast-check"
import { parquetReadObjects } from "hyparquet"
import { describe, expect, it } from "vitest"

import type { JsonSchema } from "../src/converter"
import { writeParquet } from "../src/writer"

// --- Helpers ---

/**
 * Creates an AsyncBuffer from a Uint8Array for hyparquet reader.
 */
function asyncBufferFromUint8Array(data: Uint8Array) {
  return {
    byteLength: data.byteLength,
    slice(start: number, end?: number): ArrayBuffer {
      return data.buffer.slice(
        data.byteOffset + start,
        end === undefined
          ? data.byteOffset + data.byteLength
          : data.byteOffset + end
      ) as ArrayBuffer
    },
  }
}

// --- Type definitions for generators ---

type PrimitiveKind =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "string:date-time"

// --- Arbitraries ---

/** Generate a valid field name (starts with letter, alphanumeric + underscore) */
const fieldNameArb = fc
  .tuple(
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"),
      minLength: 1,
      maxLength: 1,
    }),
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_"),
      minLength: 0,
      maxLength: 8,
    })
  )
  .map(([first, rest]) => first + rest)

/** Generate a unique array of field names */
function uniqueFieldNamesArb(min: number, max: number): fc.Arbitrary<string[]> {
  return fc.uniqueArray(fieldNameArb, { minLength: min, maxLength: max })
}

/** Generates one of the primitive kinds */
const primitiveKindArb: fc.Arbitrary<PrimitiveKind> = fc.constantFrom(
  "string",
  "string:date-time",
  "integer",
  "number",
  "boolean"
)

/** Build a JsonSchema field from a primitive kind */
function primitiveFieldSchema(kind: PrimitiveKind): JsonSchema {
  if (kind === "string:date-time") {
    return { type: "string", format: "date-time" }
  }
  return { type: kind }
}

/** Generate a value conforming to a primitive kind */
function valueArbForKind(kind: PrimitiveKind): fc.Arbitrary<unknown> {
  switch (kind) {
    case "string": {
      // Use simple ASCII strings to avoid encoding issues
      return fc.string({
        unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789 "),
        minLength: 0,
        maxLength: 20,
      })
    }
    case "integer": {
      // Use safe integer range that fits in INT64
      return fc.integer({ min: -1_000_000, max: 1_000_000 })
    }
    case "number": {
      // Use finite doubles to avoid NaN/Infinity issues
      return fc.double({
        min: -1e6,
        max: 1e6,
        noNaN: true,
        noDefaultInfinity: true,
      })
    }
    case "boolean": {
      return fc.boolean()
    }
    case "string:date-time": {
      // Generate timestamps as integer milliseconds and convert to ISO string
      // Using integer range avoids invalid date issues with fc.date()
      return fc
        .integer({ min: 946_684_800_000, max: 1_924_991_999_999 }) // 2000-01-01 to ~2030-12-31
        .map((ms) => new Date(ms).toISOString())
    }
    default: {
      return fc.string()
    }
  }
}

/**
 * Generate a flat JSON Schema with primitive fields and an array of conforming records.
 */
const schemaAndRecordsArb: fc.Arbitrary<{
  schema: JsonSchema
  records: Record<string, unknown>[]
  fields: { name: string; kind: PrimitiveKind }[]
}> = fc
  .tuple(
    uniqueFieldNamesArb(1, 5),
    fc.array(primitiveKindArb, { minLength: 1, maxLength: 5 })
  )
  .chain(([names, kinds]) => {
    const count = Math.min(names.length, kinds.length)
    const usedNames = names.slice(0, count)
    const usedKinds = kinds.slice(0, count)

    const fields = usedNames.map((name, i) => ({
      name,
      kind: usedKinds[i] as PrimitiveKind,
    }))

    // Build the JSON Schema
    const properties: Record<string, JsonSchema> = {}
    for (const { name, kind } of fields) {
      properties[name] = primitiveFieldSchema(kind)
    }
    const schema: JsonSchema = {
      type: "object",
      properties,
      required: usedNames,
    }

    // Generate 1-10 records conforming to the schema
    const recordArb = fc.record(
      Object.fromEntries(
        fields.map(({ name, kind }) => [name, valueArbForKind(kind)])
      )
    )

    return fc
      .array(recordArb, { minLength: 1, maxLength: 10 })
      .map((records) => ({
        schema,
        records,
        fields,
      }))
  })

// --- Comparison helpers ---

/**
 * Normalize a value read back from Parquet for comparison.
 * - BigInt integers → number
 * - Date objects → ISO string (with millisecond precision)
 * - Timestamps (numbers representing millis) → ISO string
 */
function normalizeReadValue(value: unknown, kind: PrimitiveKind): unknown {
  if (value === null || value === undefined) {
    return null
  }

  switch (kind) {
    case "integer": {
      // hyparquet returns BigInt for INT64
      if (typeof value === "bigint") {
        return Number(value)
      }
      if (typeof value === "number") {
        return value
      }
      return Number(value)
    }
    case "string:date-time": {
      // hyparquet may return Date objects or BigInt timestamps (millis)
      if (value instanceof Date) {
        return value.toISOString()
      }
      if (typeof value === "bigint") {
        return new Date(Number(value)).toISOString()
      }
      if (typeof value === "number") {
        return new Date(value).toISOString()
      }
      return value
    }
    case "number": {
      return typeof value === "number" ? value : Number(value)
    }
    case "boolean": {
      return Boolean(value)
    }
    case "string": {
      return String(value)
    }
    default: {
      return value
    }
  }
}

/**
 * Normalize the original input value for comparison.
 */
function normalizeInputValue(value: unknown, kind: PrimitiveKind): unknown {
  if (value === null || value === undefined) {
    return null
  }

  switch (kind) {
    case "integer": {
      return Number(value)
    }
    case "string:date-time": {
      // Truncate to millisecond precision (Parquet TIMESTAMP_MILLIS)
      if (typeof value === "string") {
        const d = new Date(value)
        return d.toISOString()
      }
      return value
    }
    case "number": {
      return typeof value === "number" ? value : Number(value)
    }
    case "boolean": {
      return Boolean(value)
    }
    case "string": {
      return String(value)
    }
    default: {
      return value
    }
  }
}

// --- Property Test ---

describe("Property 5: Parquet Write/Read Round-Trip", () => {
  it("serializing records to Parquet and deserializing produces equivalent data", async () => {
    await fc.assert(
      fc.asyncProperty(
        schemaAndRecordsArb,
        async ({ schema, records, fields }) => {
          // 1. Write to Parquet
          const parquetData = writeParquet({ records, jsonSchema: schema })
          expect(parquetData).toBeInstanceOf(Uint8Array)
          expect(parquetData.byteLength).toBeGreaterThan(0)

          // 2. Read back with hyparquet
          const file = asyncBufferFromUint8Array(parquetData)
          const readRecords = await parquetReadObjects({ file })

          // 3. Assert same number of records
          expect(readRecords).toHaveLength(records.length)

          // 4. Assert field-by-field equivalence
          for (let rowIdx = 0; rowIdx < records.length; rowIdx += 1) {
            const originalRecord = records[rowIdx] as Record<string, unknown>
            const readRecord = readRecords[rowIdx] as Record<string, unknown>

            for (const { name, kind } of fields) {
              const originalValue = normalizeInputValue(
                originalRecord[name],
                kind
              )
              const readValue = normalizeReadValue(readRecord[name], kind)

              // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field type
              if (kind === "number") {
                // For doubles, use approximate equality to handle floating point
                // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field type
                if (originalValue === 0 && readValue === 0) {
                  // Both zero (handles -0 vs +0)
                  // oxlint-disable-next-line vitest/no-conditional-expect -- nested conditional in property test
                  expect(true).toBeTruthy()
                } else {
                  // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field type
                  expect(readValue).toBeCloseTo(originalValue as number, 10)
                }
              } else {
                // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field type
                expect(readValue).toStrictEqual(originalValue)
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
