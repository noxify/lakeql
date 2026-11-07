import type { JsonSchema } from "./converter"

/**
 * Resolves the effective type from a JSON Schema, handling union types
 * (e.g. `["string", "null"]`) by returning the first non-null type.
 */
export function resolveType(schema: JsonSchema): string {
  if (!schema.type) {
    return "unknown"
  }
  if (Array.isArray(schema.type)) {
    return schema.type.find((t) => t !== "null") ?? "unknown"
  }
  return schema.type
}

/**
 * Coerces a single JSON value to the representation expected by the Parquet
 * writer, according to its field schema.
 *
 * Conversions:
 * - `date-time` string → `Date`
 * - `integer` → `BigInt`
 * - `object` → recursively coerced record
 * - `array` → element-wise coerced array (per `items` schema)
 * - `null`/`undefined` → `null`
 * - everything else → passed through unchanged
 */
export function coerceValue(value: unknown, schema: JsonSchema): unknown {
  if (value === null || value === undefined) {
    return null
  }

  switch (resolveType(schema)) {
    case "string": {
      return schema.format === "date-time" ? new Date(value as string) : value
    }
    case "integer": {
      return BigInt(value as number | string)
    }
    case "object": {
      return coerceObject(value as Record<string, unknown>, schema)
    }
    case "array": {
      return coerceArray(value as unknown[], schema)
    }
    default: {
      return value
    }
  }
}

/**
 * Recursively coerces the fields of a nested object per its schema properties.
 */
function coerceObject(
  value: Record<string, unknown>,
  schema: JsonSchema
): Record<string, unknown> {
  const properties = schema.properties ?? {}
  const result: Record<string, unknown> = {}
  for (const [key, subSchema] of Object.entries(properties)) {
    result[key] = coerceValue(value[key], subSchema)
  }
  return result
}

/**
 * Coerces each element of an array per the array's `items` schema.
 */
function coerceArray(value: unknown[], schema: JsonSchema): unknown[] {
  const itemsSchema = schema.items
  if (!itemsSchema) {
    return value
  }
  return value.map((item) => coerceValue(item, itemsSchema))
}

/**
 * Transforms one record into the Parquet-writer representation by coercing
 * each top-level property per the schema.
 *
 * @param record - The source record.
 * @param jsonSchema - The object schema describing the record's properties.
 * @returns A new record with coerced values.
 */
export function transformRecord(
  record: Record<string, unknown>,
  jsonSchema: JsonSchema
): Record<string, unknown> {
  const properties = jsonSchema.properties ?? {}
  const result: Record<string, unknown> = {}
  for (const [name, fieldSchema] of Object.entries(properties)) {
    result[name] = coerceValue(record[name], fieldSchema)
  }
  return result
}

/**
 * Lazily transforms records one at a time, yielding each coerced record.
 *
 * Keeping this a generator bounds peak memory: only one transformed record
 * exists at a time, which lets the caller stream row groups.
 *
 * @param records - The source records.
 * @param jsonSchema - The object schema describing each record.
 * @yields {Record<string, unknown>} Each record coerced to the Parquet-writer representation.
 */
export function* transformRows(
  records: readonly Record<string, unknown>[],
  jsonSchema: JsonSchema
): Generator<Record<string, unknown>> {
  for (const record of records) {
    yield transformRecord(record, jsonSchema)
  }
}
