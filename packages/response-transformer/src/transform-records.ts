/**
 * Adapter-neutral, schema-aware transformation for keyed raw records.
 *
 * Runs after an adapter's `ResponseNormalizer` has decoded the wire protocol
 * into keyed records. Walks each record against a schema, converting nested
 * objects and arrays, applying field mapping, and normalizing null-ish scalar
 * values. It never branches on adapter names and never decodes date/timestamp
 * or timezone information — that stays adapter-owned in the normalizer.
 *
 * @module
 */

/**
 * Minimal JSON-Schema subset interpreted by {@link transformRecords}.
 */
export interface TransformSchema {
  /** JSON-Schema type. Only `"object"` and `"array"` trigger recursion. */
  type?: string
  /** Property schemas for `"object"` types, keyed by SOURCE field name. */
  properties?: Record<string, TransformSchema>
  /** Item schema for `"array"` types. */
  items?: TransformSchema
}

/**
 * Input for {@link transformRecords}.
 */
export interface TransformRecordsInput {
  /** Already-keyed records produced by an adapter normalizer. */
  records: readonly Record<string, unknown>[]
  /** Schema used to interpret nested object/array fields. */
  schema: TransformSchema
  /**
   * Field renaming, direction SOURCE key → TARGET key.
   *
   * Top-level fields are typically already renamed by the query dialect via
   * SQL aliases, so this mapping is primarily relevant for fields nested
   * inside object/array structures where SQL aliases cannot reach.
   */
  fieldMapping?: Readonly<Record<string, string>>
}

/**
 * Returns `true` when a schema type denotes a nested structure that requires
 * recursive transformation.
 */
function isStructuralType(type: string | undefined): boolean {
  return type === "object" || type === "array"
}

/**
 * Transforms a single record against an object schema.
 *
 * @param record - The keyed record to transform.
 * @param schema - Object schema whose `properties` drive field iteration.
 * @param fieldMapping - SOURCE → TARGET field renaming applied at this level.
 * @returns A new record with mapped keys and schema-driven nested handling.
 */
function transformObjectRecord(
  record: Record<string, unknown>,
  schema: TransformSchema,
  fieldMapping: Readonly<Record<string, string>>
): Record<string, unknown> {
  const properties = schema.properties ?? {}
  const result: Record<string, unknown> = {}

  // Iterate schema properties: fields present on the record but absent from
  // the schema are skipped (unknown fields); fields declared in the schema
  // are transformed, with missing scalar values normalized to null.
  for (const sourceKey of Object.keys(properties)) {
    const fieldSchema = properties[sourceKey]
    if (fieldSchema === undefined) {
      continue
    }

    const targetKey = fieldMapping[sourceKey] ?? sourceKey
    result[targetKey] = transformValue(
      record[sourceKey],
      fieldSchema,
      fieldMapping
    )
  }

  return result
}

/**
 * Transforms a single value according to its field schema.
 *
 * - Object values recurse via `schema.properties`.
 * - Array values recurse via `schema.items` (scalars pass through, objects
 *   are transformed element-by-element).
 * - Scalar values are copied through, normalizing `null`/`undefined` to `null`.
 */
function transformValue(
  value: unknown,
  schema: TransformSchema,
  fieldMapping: Readonly<Record<string, string>>
): unknown {
  if (schema.type === "object") {
    if (value === null || value === undefined) {
      return null
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      // Schema expects an object but the value is not one: preserve as-is.
      return value
    }
    return transformObjectRecord(
      value as Record<string, unknown>,
      schema,
      fieldMapping
    )
  }

  if (schema.type === "array") {
    if (value === null || value === undefined) {
      return null
    }
    if (!Array.isArray(value)) {
      return value
    }

    const itemSchema = schema.items
    // Arrays of scalars (or no item schema) pass through unchanged.
    if (itemSchema === undefined || !isStructuralType(itemSchema.type)) {
      return value
    }

    return value.map((element) =>
      transformValue(element, itemSchema, fieldMapping)
    )
  }

  // Scalar field: normalize null-ish to null, otherwise preserve.
  return value ?? null
}

/**
 * Transforms keyed raw records against a schema.
 *
 * @param input - Records, schema, and optional field mapping.
 * @returns A new array of transformed records.
 */
export function transformRecords(
  input: TransformRecordsInput
): Record<string, unknown>[] {
  const { records, schema, fieldMapping = {} } = input

  return records.map((record) =>
    transformObjectRecord(record, schema, fieldMapping)
  )
}
