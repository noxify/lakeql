import type { JsonSchema } from "./converter"

export interface ColumnData {
  name: string
  data: unknown[]
}

/**
 * Transforms row-oriented records into columnar format for hyparquet-writer.
 *
 * Handles:
 * - Primitive fields: extracted as typed arrays
 * - DateTime fields: converted from ISO string to Date objects
 * - Integer fields: converted to BigInt
 * - Nested objects: flattened per hyparquet group format
 * - Arrays: structured per hyparquet LIST format
 */
export function recordsToColumnar(
  records: Record<string, unknown>[],
  jsonSchema: JsonSchema
): ColumnData[] {
  const properties = jsonSchema.properties ?? {}
  return Object.entries(properties).map(([fieldName, fieldSchema]) => ({
    name: fieldName,
    data: extractColumn(records, fieldName, fieldSchema),
  }))
}

/**
 * Extracts a single column of values from the records array,
 * applying appropriate type conversions based on the field's JSON Schema.
 */
function extractColumn(
  records: Record<string, unknown>[],
  fieldName: string,
  schema: JsonSchema
): unknown[] {
  const resolvedType = resolveType(schema)

  switch (resolvedType) {
    case "string": {
      if (schema.format === "date-time") {
        return records.map((r) => {
          const value = r[fieldName]
          if (value === null || value === undefined) {
            return null
          }
          return new Date(value as string)
        })
      }
      return records.map((r) => r[fieldName] ?? null)
    }

    case "integer": {
      return records.map((r) => {
        const value = r[fieldName]
        if (value === null || value === undefined) {
          return null
        }
        return BigInt(value as number | string)
      })
    }

    case "number":
    case "boolean": {
      return records.map((r) => r[fieldName] ?? null)
    }

    case "object": {
      // Nested objects: transform each record's nested object
      // into the hyparquet group format (object with converted sub-fields)
      return records.map((r) => {
        const value = r[fieldName] as Record<string, unknown> | null | undefined
        if (value === null || value === undefined) {
          return null
        }
        return transformNestedObject(value, schema)
      })
    }

    case "array": {
      // Arrays: structure per hyparquet LIST format
      // Each record's array value is transformed with appropriate type conversions
      return records.map((r) => {
        const value = r[fieldName] as unknown[] | null | undefined
        if (value === null || value === undefined) {
          return null
        }
        return transformArrayValue(value, schema)
      })
    }

    default: {
      return records.map((r) => r[fieldName] ?? null)
    }
  }
}

/**
 * Resolves the effective type from a JSON Schema, handling union types (e.g., ["string", "null"]).
 */
function resolveType(schema: JsonSchema): string {
  if (!schema.type) {
    return "unknown"
  }

  if (Array.isArray(schema.type)) {
    return schema.type.find((t) => t !== "null") ?? "unknown"
  }

  return schema.type
}

/**
 * Transforms a nested object value according to its JSON Schema definition.
 * Applies type conversions (DateTime→Date, Integer→BigInt) to sub-fields.
 */
function transformNestedObject(
  value: Record<string, unknown>,
  schema: JsonSchema
): Record<string, unknown> {
  const properties = schema.properties ?? {}
  const result: Record<string, unknown> = {}

  for (const [key, subSchema] of Object.entries(properties)) {
    const subType = resolveType(subSchema)
    const subValue = value[key]

    if (subValue === null || subValue === undefined) {
      result[key] = null
      continue
    }

    switch (subType) {
      case "string": {
        result[key] =
          subSchema.format === "date-time"
            ? new Date(subValue as string)
            : subValue
        break
      }
      case "integer": {
        result[key] = BigInt(subValue as number | string)
        break
      }
      case "object": {
        result[key] = transformNestedObject(
          subValue as Record<string, unknown>,
          subSchema
        )
        break
      }
      case "array": {
        result[key] = transformArrayValue(subValue as unknown[], subSchema)
        break
      }
      default: {
        result[key] = subValue
        break
      }
    }
  }

  return result
}

/**
 * Transforms an array value according to the array's items schema.
 * For primitive arrays: applies type conversions to each element.
 * For object arrays: transforms each element's sub-fields recursively.
 */
function transformArrayValue(value: unknown[], schema: JsonSchema): unknown[] {
  const itemsSchema = schema.items
  if (!itemsSchema) {
    return value
  }

  const itemType = resolveType(itemsSchema)

  switch (itemType) {
    case "string": {
      if (itemsSchema.format === "date-time") {
        return value.map((item) => {
          if (item === null || item === undefined) {
            return null
          }
          return new Date(item as string)
        })
      }
      return value
    }
    case "integer": {
      return value.map((item) => {
        if (item === null || item === undefined) {
          return null
        }
        return BigInt(item as number | string)
      })
    }
    case "object": {
      return value.map((item) => {
        if (item === null || item === undefined) {
          return null
        }
        return transformNestedObject(
          item as Record<string, unknown>,
          itemsSchema
        )
      })
    }
    case "array": {
      return value.map((item) => {
        if (item === null || item === undefined) {
          return null
        }
        return transformArrayValue(item as unknown[], itemsSchema)
      })
    }
    default: {
      return value
    }
  }
}
