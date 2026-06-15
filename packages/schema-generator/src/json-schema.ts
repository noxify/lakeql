import { isObject } from "@lakeql/helpers/object-helper"
import type { JSONType } from "json-column-parser/lib/common/types/type.common"
import type { JSONSchema7, JSONSchema7Definition } from "json-schema"
import { createRegExp, global, not } from "magic-regexp"

import type {
  ArrayItemDefinition,
  FieldDefinition,
  PrimitiveType,
} from "./endpoint-schema"

export function generateJsonSchema(parsedColumns: Record<string, JSONType>) {
  const jsonSchema: JSONSchema7 = {
    $schema: "https://json-schema.org/draft-07/schema#",
    ...handleObject(parsedColumns),
    additionalProperties: false,
  }

  return jsonSchema
}

function handlePrimitive(columnType: JSONType): JSONSchema7Definition {
  // this generates a regular expression which will remove everything but a-zA-Z
  // we need this to convert `timestamp(3)` to `timestamp``
  // or `decimal(3,10)` to `decimal`
  const replaceExpression = createRegExp(not.letter, [global])

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const normalizedColumnType = columnType
    .toString()
    .replace(replaceExpression, "")

  switch (normalizedColumnType) {
    case "varchar": {
      return {
        type: "string",
      }
    }
    case "decimal":
    case "double":
    case "float": {
      return {
        type: "number",
      }
    }

    case "integer":
    case "bigint": {
      return {
        type: "integer",
      }
    }

    case "boolean": {
      return {
        type: "boolean",
      }
    }

    case "timestamp": {
      return {
        format: "date-time",
        type: "string",
      }
    }

    case "date": {
      return {
        format: "date",
        type: "string",
      }
    }

    default: {
      // fallback

      throw new Error(`Type ${normalizedColumnType.toString()} is unknown.`)
    }
  }
}

function handleArray(columnType: JSONType[]): JSONSchema7Definition {
  /**
   * We currently support the following cases
   * * array of primitives (string/number/boolean/datetime/etc.)
   * * array of object
   *
   * If you have the usecase that you need support for "array of array of X"
   * feel free to raise an issue :)
   */

  if (columnType.length > 1) {
    throw new Error(
      "We expect that an array has only one element ( e.g. a primitive like `varchar` or an object like `row()`."
    )
  }

  if (Array.isArray(columnType[0])) {
    throw new TypeError(
      `We currently do not support 'array of array'. Feel free to raise an issue.`
    )
  }

  if (typeof columnType[0] === "string") {
    // array of primitive
    return {
      items: handlePrimitive(columnType[0]),
      type: "array",
    }
  } else if (isObject(columnType[0])) {
    return {
      items: handleObject(columnType[0] as Record<string, JSONType>),
      type: "array",
    }
  }
  throw new Error("Unexpected case in `json-generator.handleArray`")
}

function handleObject(columns: Record<string, JSONType>): JSONSchema7 {
  const schema: JSONSchema7 = {
    additionalProperties: false,
    properties: {},
    type: "object",
  }

  for (const [columnName, columnType] of Object.entries(columns)) {
    if (typeof columnType === "string") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        schema.properties![columnName] = handlePrimitive(columnType)
      } catch (error) {
        // oxlint-disable-next-line no-console
        console.log(error)
      }
    }

    if (Array.isArray(columnType)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        schema.properties![columnName] = handleArray(columnType)
      } catch (error) {
        // oxlint-disable-next-line no-console
        console.log(error)
      }
    }

    if (isObject(columnType)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        schema.properties![columnName] = handleObject(
          columnType as Record<string, JSONType>
        )
      } catch (error) {
        // oxlint-disable-next-line no-console
        console.log(error)
      }
    }
  }

  return schema
}

// --- FieldDefinition-based JSON Schema generation ---

/**
 * Maps a PrimitiveType to its corresponding JSON Schema property.
 */
function fieldPrimitiveToJsonSchema(
  primitiveType: PrimitiveType
): JSONSchema7Definition {
  switch (primitiveType) {
    case "String": {
      return { type: "string" }
    }
    case "Integer": {
      return { type: "integer" }
    }
    case "Float": {
      return { type: "number" }
    }
    case "Boolean": {
      return { type: "boolean" }
    }
    case "Date": {
      return { type: "string", format: "date" }
    }
    case "DateTime": {
      return { type: "string", format: "date-time" }
    }
    default: {
      return { type: "string" }
    }
  }
}

/**
 * Converts an ArrayItemDefinition to a JSON Schema property for the `items` field.
 */
function fieldArrayItemToJsonSchema(
  item: ArrayItemDefinition
): JSONSchema7Definition {
  if (item.type === "Object" && item.fields) {
    return {
      type: "object",
      properties: fieldDefinitionsToProperties(item.fields),
      additionalProperties: false,
    }
  }
  return fieldPrimitiveToJsonSchema(item.type as PrimitiveType)
}

/**
 * Converts a single FieldDefinition to a JSON Schema property.
 */
function fieldDefinitionToJsonSchema(
  field: FieldDefinition
): JSONSchema7Definition {
  switch (field.type) {
    case "Object": {
      return {
        type: "object",
        properties: fieldDefinitionsToProperties(field.fields ?? []),
        additionalProperties: false,
      }
    }
    case "Array": {
      return {
        type: "array",
        items: field.items
          ? fieldArrayItemToJsonSchema(field.items)
          : { type: "string" },
      }
    }
    default: {
      return fieldPrimitiveToJsonSchema(field.type)
    }
  }
}

/**
 * Converts an array of FieldDefinitions to a JSON Schema `properties` object.
 */
function fieldDefinitionsToProperties(
  fields: FieldDefinition[]
): Record<string, JSONSchema7Definition> {
  const properties: Record<string, JSONSchema7Definition> = {}
  for (const field of fields) {
    properties[field.name] = fieldDefinitionToJsonSchema(field)
  }
  return properties
}

/**
 * Converts an array of FieldDefinitions to a complete JSON Schema Draft-07 document.
 *
 * The root schema has `$schema`, `type: "object"`, `properties`, and `additionalProperties: false`.
 * Each field is recursively mapped according to the type mapping rules:
 * - String → {type: "string"}
 * - Integer → {type: "integer"}
 * - Float → {type: "number"}
 * - Boolean → {type: "boolean"}
 * - Date → {type: "string", format: "date"}
 * - DateTime → {type: "string", format: "date-time"}
 * - Object → {type: "object", properties: {...}, additionalProperties: false}
 * - Array (primitive) → {type: "array", items: {primitive schema}}
 * - Array (object) → {type: "array", items: {type: "object", properties: {...}, additionalProperties: false}}
 */
export function generateJsonSchemaFromFields(
  fields: FieldDefinition[]
): JSONSchema7 {
  return {
    $schema: "https://json-schema.org/draft-07/schema#",
    type: "object",
    properties: fieldDefinitionsToProperties(fields),
    additionalProperties: false,
  }
}
