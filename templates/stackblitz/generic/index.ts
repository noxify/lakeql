/**
 * LakeQL Bug Reproduction
 *
 * Use this template to demonstrate a bug across any LakeQL package.
 * Replace the code below with a minimal example that reproduces the issue.
 */

import { parseColumns } from "@lakeql/column-parser"
import { calculatePageInfo } from "@lakeql/helpers/calculate-page-info"
import { generateQuery, formatQuery } from "@lakeql/query-builder"
import { convertTrinoResponse, transform } from "@lakeql/response-transformer"
import { generateJsonSchema } from "@lakeql/schema-generator/json-schema"

// Example: Parse columns and generate a JSON schema
const columns = parseColumns([
  { name: "id", type: "bigint", extra: "", description: "Primary key" },
  { name: "name", type: "varchar", extra: "", description: "User name" },
  { name: "created_at", type: "timestamp(3)", extra: "", description: "" },
])

console.log("Parsed columns:", JSON.stringify(columns, null, 2))

const jsonSchema = generateJsonSchema(columns)
console.log("JSON Schema:", JSON.stringify(jsonSchema, null, 2))

// Example: Transform a Trino response
const result = convertTrinoResponse({
  keys: ["id", "name", "created_at"],
  values: [1, "Alice", 1700000000],
})
console.log("Converted response:", result)

// Example: Calculate pagination
const pageInfo = calculatePageInfo({ totalCount: 250, perPage: 25, page: 3 })
console.log("Page info:", pageInfo)
