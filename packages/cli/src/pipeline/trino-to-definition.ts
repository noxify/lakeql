import type { JSONType } from "@lakeql/column-parser"

import type {
  ArrayItemDefinition,
  EndpointDefinitionFormat,
  FieldDefinition,
  PrimitiveType,
} from "./schema"

/**
 * Maps a Trino primitive type string (as output by json-column-parser) to a FieldDefinition PrimitiveType.
 *
 * The parser normalizes Trino types like `varchar`, `timestamp(3)`, `decimal(10,2)` etc.
 * We strip non-letter characters to handle parameterized types.
 */
function mapPrimitiveType(trinoType: string): PrimitiveType {
  const normalized = trinoType.replaceAll(/[^a-zA-Z]/gu, "")

  switch (normalized) {
    case "varchar": {
      return "String"
    }
    case "decimal":
    case "double":
    case "float": {
      return "Float"
    }
    case "integer":
    case "bigint": {
      return "Integer"
    }
    case "boolean": {
      return "Boolean"
    }
    case "timestamp": {
      return "DateTime"
    }
    case "date": {
      return "Date"
    }
    default: {
      return "String"
    }
  }
}

/**
 * Converts a single JSONType value to a FieldDefinition.
 */
function jsonTypeToFieldDefinition(
  name: string,
  columnType: JSONType
): FieldDefinition {
  // Primitive: JSONType is a string like "varchar", "timestamp(3)", etc.
  if (typeof columnType === "string") {
    return {
      name,
      type: mapPrimitiveType(columnType),
    }
  }

  // Array: JSONType is an array (e.g., ["varchar"] or [{ key: "varchar", value: "varchar" }])
  if (Array.isArray(columnType)) {
    return {
      name,
      type: "Array",
      items: jsonArrayToItemDefinition(columnType),
    }
  }

  // Object: JSONType is a Record<string, JSONType> representing a struct/row
  if (typeof columnType === "object" && columnType !== null) {
    const fields = objectToFieldDefinitions(
      columnType as Record<string, JSONType>
    )
    return {
      name,
      type: "Object",
      fields,
    }
  }

  // Fallback for number/boolean JSONType values (unlikely from parseColumns but handle gracefully)
  return {
    name,
    type: "String",
  }
}

/**
 * Converts a JSONArray (array column type) to an ArrayItemDefinition.
 * The array is expected to have exactly one element describing the item type.
 */
function jsonArrayToItemDefinition(
  columnType: JSONType[]
): ArrayItemDefinition {
  if (columnType.length === 0) {
    return { type: "String" }
  }

  const [itemType] = columnType

  // Array of primitives
  if (typeof itemType === "string") {
    return { type: mapPrimitiveType(itemType) }
  }

  // Array of objects
  if (
    typeof itemType === "object" &&
    itemType !== null &&
    !Array.isArray(itemType)
  ) {
    const fields = objectToFieldDefinitions(
      itemType as Record<string, JSONType>
    )
    return { type: "Object", fields }
  }

  // Fallback
  return { type: "String" }
}

/**
 * Converts a Record<string, JSONType> (object/struct) to an array of FieldDefinitions.
 */
function objectToFieldDefinitions(
  columns: Record<string, JSONType>
): FieldDefinition[] {
  const fields: FieldDefinition[] = []

  for (const [columnName, columnType] of Object.entries(columns)) {
    fields.push(jsonTypeToFieldDefinition(columnName, columnType))
  }

  return fields
}

/**
 * Converts parsed Trino columns (from `@lakeql/column-parser`) to an EndpointDefinitionFormat.
 *
 * This is used by the refactored `pull` command to convert Trino table metadata into
 * the canonical endpoint definition format, enabling shared pipeline processing.
 *
 * @param options.tableName - The Trino table name
 * @param options.catalog - The Trino catalog name
 * @param options.schema - The Trino schema name
 * @param options.parsedColumns - Output from `parseColumns()`: Record<string, JSONType>
 * @returns A valid EndpointDefinitionFormat object
 */
export function trinoColumnsToDefinition(options: {
  tableName: string
  catalog: string
  schema: string
  parsedColumns: Record<string, JSONType>
}): EndpointDefinitionFormat {
  const { tableName, catalog, schema, parsedColumns } = options

  const fields = objectToFieldDefinitions(parsedColumns)

  return {
    version: "1.0",
    tableName,
    catalog,
    schema,
    fields,
    mutation: false,
  }
}
