import path from "node:path"

import type { JSONSchema7 } from "json-schema"

type SqlType = "varchar" | "timestamp(3)" | "bigint" | "double" | "boolean"
type SqlFieldDefinition = [string, string]

interface ConvertTypeOptions {
  fieldName: string
  type: string
  isArray?: boolean
  isObject?: boolean
  fields?: SqlFieldDefinition[]
}

interface SchemaDefinition {
  type: string
  format?: string
  items?: SchemaDefinition | SchemaDefinition[]
  properties?: Record<string, SchemaDefinition>
}

type ParquetField = Record<
  string,
  | string
  | [string, ParquetField]
  | [string, { "list[]": { element: ParquetField } }]
>

// Type mapping utilities
const TYPE_MAPPINGS: Record<string, SqlType> = {
  boolean: "boolean",
  integer: "bigint",
  number: "double",
  string: "varchar",
} as const

const getBaseSqlType = (jsonType: string, format?: string): SqlType => {
  if (jsonType === "string" && format === "date-time") {
    return "timestamp(3)"
  }
  return TYPE_MAPPINGS[jsonType] ?? "varchar"
}

// Core conversion function
function convertTypeToSql({
  fieldName,
  type,
  isArray = false,
  isObject = false,
  fields = [],
}: ConvertTypeOptions): SqlFieldDefinition {
  if (isObject && isArray) {
    throw new Error(
      `Invalid combination: field "${fieldName}" cannot be both object and array`
    )
  }

  if (isObject) {
    const fieldDefs = fields
      .map(([name, fieldType]) => `${name} ${fieldType}`)
      .join(", ")
    return [fieldName, `ROW(${fieldDefs})`]
  }

  if (isArray) {
    return [fieldName, `array(${type})`]
  }

  return [fieldName, type]
}

// Array processing
function processArrayField(
  fieldName: string,
  items: SchemaDefinition | SchemaDefinition[]
): SqlFieldDefinition {
  const [firstArrayItem] = Array.isArray(items) ? items : [items]
  const arrayItems = firstArrayItem

  if (!arrayItems) {
    throw new Error(`Array field "${fieldName}" has empty items array`)
  }

  if (arrayItems.type === "object" && arrayItems.properties) {
    const objectFields = generateSqlSchema({
      definition: arrayItems.properties,
    })
    const [, rowType] = convertTypeToSql({
      fieldName: "temp",
      fields: objectFields,
      isObject: true,
      type: "ROW",
    })

    return convertTypeToSql({
      fieldName,
      isArray: true,
      type: rowType,
    })
  }

  const baseType = getBaseSqlType(arrayItems.type)
  return convertTypeToSql({ fieldName, isArray: true, type: baseType })
}

// Object processing
function processObjectField(
  fieldName: string,
  properties: Record<string, SchemaDefinition>
): SqlFieldDefinition {
  const objectFields = generateSqlSchema({ definition: properties })
  return convertTypeToSql({
    fieldName,
    fields: objectFields,
    isObject: true,
    type: "ROW",
  })
}

/**
 * Parameters for generateSqlSchema.
 */
export interface GenerateSqlSchemaProps {
  /** The JSON Schema property definitions to generate SQL columns from. */
  definition: Record<string, SchemaDefinition>
}

/**
 * Generates SQL column definitions from parsed columns.
 */
export function generateSqlSchema({
  definition,
}: GenerateSqlSchemaProps): SqlFieldDefinition[] {
  return Object.entries(definition).map(([fieldName, fieldValue]) => {
    try {
      switch (fieldValue.type) {
        case "string":
        case "integer":
        case "number":
        case "boolean": {
          const sqlType = getBaseSqlType(fieldValue.type, fieldValue.format)
          return convertTypeToSql({ fieldName, type: sqlType })
        }

        case "array": {
          if (!fieldValue.items) {
            throw new Error(
              `Array field "${fieldName}" missing items definition`
            )
          }
          return processArrayField(fieldName, fieldValue.items)
        }

        case "object": {
          if (!fieldValue.properties) {
            throw new Error(
              `Object field "${fieldName}" missing properties definition`
            )
          }
          return processObjectField(fieldName, fieldValue.properties)
        }

        default: {
          // eslint-disable-next-line no-console
          console.warn(
            `Unknown type "${fieldValue.type}" for field "${fieldName}", defaulting to varchar`
          )
          return convertTypeToSql({ fieldName, type: "varchar" })
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to process field "${fieldName}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
  })
}

function createParquetArrayField(
  fieldName: string,
  definition: JSONSchema7
): [string, { "list[]": { element: ParquetField } }] {
  const element =
    definition.type === "object" && definition.properties
      ? parquetTransformer({
          definition: definition.properties as Record<string, JSONSchema7>,
        })
      : {}

  return [fieldName, { "list[]": { element } }]
}

/**
 * Parameters for parquetTransformer.
 */
export interface ParquetTransformerProps {
  /** The JSON Schema property definitions to transform for Parquet format. */
  definition: Record<string, JSONSchema7>
}

/**
 * Transforms column definitions for Parquet format.
 */
export function parquetTransformer({
  definition,
}: ParquetTransformerProps): ParquetField {
  const result: ParquetField = {}

  for (const [fieldName, fieldDefinition] of Object.entries(definition)) {
    switch (fieldDefinition.type) {
      case "object": {
        if (fieldDefinition.properties) {
          result[fieldName] = [
            fieldName,
            parquetTransformer({
              definition: fieldDefinition.properties as Record<
                string,
                JSONSchema7
              >,
            }),
          ]
        }
        break
      }

      case "array": {
        if (
          fieldDefinition.items &&
          !Array.isArray(fieldDefinition.items) &&
          typeof fieldDefinition.items === "object"
        ) {
          result[fieldName] = createParquetArrayField(
            fieldName,
            fieldDefinition.items
          )
        }
        break
      }

      default: {
        result[fieldName] = fieldName
      }
    }
  }

  return result
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

/**
 * Parameters for generateCreateTableStatement.
 */
export interface GenerateCreateTableStatementProps {
  /** The Hive schema name. */
  schema: string
  /** The table name. */
  tableName: string
  /** The S3 bucket name for external storage. */
  bucketName: string
  /** The path within the S3 bucket. */
  bucketPath: string
  /** The JSON Schema property definitions for table columns. */
  definition: Record<string, SchemaDefinition>
}

/**
 * Generates a full CREATE TABLE DDL statement.
 */
export function generateCreateTableStatement({
  schema,
  tableName,
  bucketName,
  bucketPath,
  definition,
}: GenerateCreateTableStatementProps) {
  const fields = generateSqlSchema({ definition })
  const columnDefs = fields
    .map(([name, type]) => `  ${quoteIdentifier(name)} ${type}`)
    .join(",\n")
  const s3Location = `s3://${path.join(bucketName, bucketPath)}`

  return `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(schema)}.${quoteIdentifier(tableName)} (
${columnDefs}
)
WITH (
  external_location = '${s3Location}',
  format = 'PARQUET'
)`
}
