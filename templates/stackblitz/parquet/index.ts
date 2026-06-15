/**
 * LakeQL Bug Reproduction - @lakeql/parquet
 *
 * This package converts JSON data to Parquet format using JSON Schema definitions.
 * Replace the code below with your reproduction.
 */

import { writeParquet, jsonSchemaToParquetSchema } from "@lakeql/parquet"

// 1. Convert JSON Schema to Parquet schema
const jsonSchema = {
  type: "object" as const,
  properties: {
    id: { type: "integer" as const },
    name: { type: "string" as const },
    score: { type: "number" as const },
    is_active: { type: "boolean" as const },
    created_at: { type: "string" as const, format: "date-time" },
  },
  required: ["id", "name"],
}

const parquetSchema = jsonSchemaToParquetSchema(jsonSchema)
console.log("Parquet schema:", JSON.stringify(parquetSchema, null, 2))

// 2. Write records to Parquet binary
const records = [
  {
    id: 1,
    name: "Alice",
    score: 9.5,
    is_active: true,
    created_at: "2024-01-15T10:30:00Z",
  },
  {
    id: 2,
    name: "Bob",
    score: 7.2,
    is_active: false,
    created_at: "2024-02-20T14:00:00Z",
  },
  {
    id: 3,
    name: "Charlie",
    score: 8.8,
    is_active: true,
    created_at: "2024-03-10T09:15:00Z",
  },
]

const parquetBytes = writeParquet({ records, jsonSchema })
console.log(`\nWritten ${parquetBytes.byteLength} bytes of Parquet data`)
console.log(`Record count: ${records.length}`)

// 3. Nested schema example
const nestedSchema = {
  type: "object" as const,
  properties: {
    id: { type: "integer" as const },
    address: {
      type: "object" as const,
      properties: {
        street: { type: "string" as const },
        city: { type: "string" as const },
      },
    },
    tags: {
      type: "array" as const,
      items: { type: "string" as const },
    },
  },
}

const nestedParquetSchema = jsonSchemaToParquetSchema(nestedSchema)
console.log(
  "\nNested Parquet schema:",
  JSON.stringify(nestedParquetSchema, null, 2)
)
