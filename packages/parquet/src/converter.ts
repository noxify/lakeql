import type { SchemaElement } from "hyparquet-writer"

export interface JsonSchema {
  type?: string | string[]
  format?: string
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[] | boolean
}

type JsonSchemaType =
  | "object"
  | "array"
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "null"

interface PrimitiveSchemaFields {
  type: NonNullable<SchemaElement["type"]>
  converted_type?: SchemaElement["converted_type"]
}

function isRequiredField(parent: JsonSchema, fieldName: string): boolean {
  if (parent.required === true) {
    return true
  }

  if (Array.isArray(parent.required)) {
    return parent.required.includes(fieldName)
  }

  return false
}

function normalizeJsonSchemaType(
  schema: JsonSchema,
  fieldName: string
): { type: Exclude<JsonSchemaType, "null">; optionalFromNull: boolean } {
  if (!schema.type) {
    throw new Error(`JSON schema field "${fieldName}" is missing a type`)
  }

  if (Array.isArray(schema.type)) {
    const nonNullTypes = schema.type.filter(
      (schemaType): schemaType is Exclude<JsonSchemaType, "null"> =>
        schemaType !== "null"
    )

    if (nonNullTypes.length !== 1 || schema.type.length > 2) {
      throw new Error(
        `Unsupported JSON schema union on field '${fieldName}': ${JSON.stringify(schema.type)}`
      )
    }

    const [singleType] = nonNullTypes
    if (!singleType) {
      throw new Error(
        `Unsupported JSON schema union on field '${fieldName}': ${JSON.stringify(schema.type)}`
      )
    }

    return {
      type: singleType,
      optionalFromNull: schema.type.includes("null"),
    }
  }

  if (schema.type === "null") {
    throw new Error(
      `Unsupported JSON schema union on field '${fieldName}': ["null"]`
    )
  }

  return {
    type: schema.type as Exclude<JsonSchemaType, "null">,
    optionalFromNull: false,
  }
}

function primitiveFromJsonSchema(
  schemaType: Exclude<JsonSchemaType, "null" | "object" | "array">,
  format: string | undefined
): PrimitiveSchemaFields {
  switch (schemaType) {
    case "string": {
      if (format === "date-time") {
        return { type: "INT64", converted_type: "TIMESTAMP_MILLIS" }
      }
      // oxlint-disable-next-line unicorn/text-encoding-identifier-case -- UTF8 is a Parquet converted_type constant
      return { type: "BYTE_ARRAY", converted_type: "UTF8" }
    }
    case "integer": {
      return { type: "INT64" }
    }
    case "number": {
      return { type: "DOUBLE" }
    }
    case "boolean": {
      return { type: "BOOLEAN" }
    }
    default: {
      throw new Error(`Unsupported JSON schema primitive type '${schemaType}'`)
    }
  }
}

function jsonSchemaFieldToElements(
  fieldName: string,
  schema: JsonSchema,
  required: boolean
): SchemaElement[] {
  const { type, optionalFromNull } = normalizeJsonSchemaType(schema, fieldName)

  const repetition_type: SchemaElement["repetition_type"] =
    required && !optionalFromNull ? "REQUIRED" : "OPTIONAL"

  if (type === "object") {
    const properties = schema.properties ?? {}
    const entries = Object.entries(properties)

    const parent: SchemaElement = {
      name: fieldName,
      repetition_type,
      num_children: entries.length,
    }

    const children = entries.flatMap(([name, propertySchema]) =>
      jsonSchemaFieldToElements(
        name,
        propertySchema,
        isRequiredField(schema, name)
      )
    )

    return [parent, ...children]
  }

  if (type === "array") {
    if (!schema.items) {
      throw new Error(
        `JSON schema array field '${fieldName}' is missing 'items'`
      )
    }

    const listRoot: SchemaElement = {
      name: fieldName,
      repetition_type,
      converted_type: "LIST",
      num_children: 1,
    }

    const listNode: SchemaElement = {
      name: "list",
      repetition_type: "REPEATED",
      num_children: 1,
    }

    // Keep list elements OPTIONAL for robust compatibility with parquet readers/writers.
    const element = jsonSchemaFieldToElements("element", schema.items, false)

    return [listRoot, listNode, ...element]
  }

  const primitive = primitiveFromJsonSchema(type, schema.format)

  return [
    {
      name: fieldName,
      repetition_type,
      ...primitive,
    },
  ]
}

/**
 * Converts a JSON Schema definition to a hyparquet SchemaElement array.
 *
 * Type mappings:
 * - string → BYTE_ARRAY (UTF8)
 * - string (date-time) → INT64 (TIMESTAMP_MILLIS)
 * - integer → INT64
 * - number → DOUBLE
 * - boolean → BOOLEAN
 * - object → group element with children
 * - array → LIST converted type with repeated group
 *
 * @throws {Error} if top-level type is not "object"
 * @throws {Error} if a field has a union with more than one non-null type
 * @throws {Error} if an array field is missing "items"
 * @throws {Error} if a field has an unsupported primitive type
 */
export function jsonSchemaToParquetSchema(
  jsonSchema: JsonSchema
): SchemaElement[] {
  const { type } = normalizeJsonSchemaType(jsonSchema, "root")

  if (type !== "object") {
    throw new Error("Top-level JSON schema must be of type 'object'")
  }

  const properties = jsonSchema.properties ?? {}
  const entries = Object.entries(properties)

  const root: SchemaElement = {
    name: "root",
    num_children: entries.length,
  }

  return [
    root,
    ...entries.flatMap(([fieldName, schema]) =>
      jsonSchemaFieldToElements(
        fieldName,
        schema,
        isRequiredField(jsonSchema, fieldName)
      )
    ),
  ]
}
