import type { JSONType } from "@lakeql/column-parser"
import type { TypeMapper } from "@lakeql/datasource"

import type {
  ArrayItemDefinition,
  EndpointDefinitionFormat,
  FieldDefinition,
} from "./schema"

/**
 * Converts a single {@link JSONType} value to a {@link FieldDefinition}.
 *
 * @param name - The column/field name.
 * @param columnType - The parsed column type (primitive string, array, or struct).
 * @param typeMapper - Adapter-specific mapper for primitive engine types.
 */
function jsonTypeToFieldDefinition(
  name: string,
  columnType: JSONType,
  typeMapper: TypeMapper
): FieldDefinition {
  // Primitive: JSONType is a string like "varchar", "timestamp(3)", etc.
  if (typeof columnType === "string") {
    return {
      name,
      type: typeMapper.toPrimitiveType(columnType),
    }
  }

  // Array: JSONType is an array (e.g. ["varchar"] or [{ ... }]).
  if (Array.isArray(columnType)) {
    return {
      name,
      type: "Array",
      items: jsonArrayToItemDefinition(columnType, typeMapper),
    }
  }

  // Object: JSONType is a Record<string, JSONType> representing a struct/row.
  if (typeof columnType === "object" && columnType !== null) {
    return {
      name,
      type: "Object",
      fields: objectToFieldDefinitions(
        columnType as Record<string, JSONType>,
        typeMapper
      ),
    }
  }

  // Fallback for number/boolean JSONType values (unlikely from parseColumns).
  return {
    name,
    type: "String",
  }
}

/**
 * Converts an array column type to an {@link ArrayItemDefinition}.
 *
 * The array is expected to hold exactly one element describing the item type.
 *
 * @param columnType - The array of item types.
 * @param typeMapper - Adapter-specific mapper for primitive engine types.
 */
function jsonArrayToItemDefinition(
  columnType: JSONType[],
  typeMapper: TypeMapper
): ArrayItemDefinition {
  if (columnType.length === 0) {
    return { type: "String" }
  }

  const [itemType] = columnType

  // Array of primitives.
  if (typeof itemType === "string") {
    return { type: typeMapper.toPrimitiveType(itemType) }
  }

  // Array of objects.
  if (
    typeof itemType === "object" &&
    itemType !== null &&
    !Array.isArray(itemType)
  ) {
    return {
      type: "Object",
      fields: objectToFieldDefinitions(
        itemType as Record<string, JSONType>,
        typeMapper
      ),
    }
  }

  return { type: "String" }
}

/**
 * Converts a struct/object column into an array of {@link FieldDefinition}s.
 *
 * @param columns - Map of column name to parsed column type.
 * @param typeMapper - Adapter-specific mapper for primitive engine types.
 */
function objectToFieldDefinitions(
  columns: Record<string, JSONType>,
  typeMapper: TypeMapper
): FieldDefinition[] {
  return Object.entries(columns).map(([columnName, columnType]) =>
    jsonTypeToFieldDefinition(columnName, columnType, typeMapper)
  )
}

/**
 * Converts parsed columns (from `@lakeql/column-parser`) into an
 * {@link EndpointDefinitionFormat}, using an adapter-specific
 * {@link TypeMapper} to map engine primitive types to LakeQL primitives.
 *
 * @param options - Table coordinates, parsed columns, and the type mapper.
 * @param options.tableName - The table name.
 * @param options.catalog - The catalog name.
 * @param options.schema - The schema name.
 * @param options.parsedColumns - Output of `parseColumns()`.
 * @param options.typeMapper - Adapter-specific type mapper (`dataSource.typeMapper`).
 * @returns A valid endpoint definition.
 */
export function columnsToDefinition(options: {
  tableName: string
  catalog: string
  schema: string
  parsedColumns: Record<string, JSONType>
  typeMapper: TypeMapper
}): EndpointDefinitionFormat {
  const { tableName, catalog, schema, parsedColumns, typeMapper } = options

  return {
    version: "1.0",
    tableName,
    catalog,
    schema,
    fields: objectToFieldDefinitions(parsedColumns, typeMapper),
    mutation: false,
  }
}
