/**
 * LakeQL Bug Reproduction - @lakeql/schema-generator
 *
 * This package generates JSON Schemas, GraphQL models, and Hive DDL
 * from column definitions. Replace the code below with your reproduction.
 */

import { endpointDefinitionSchema } from "@lakeql/schema-generator/endpoint-schema"
import { generateModel } from "@lakeql/schema-generator/graphql-schema"
import {
  generateSqlSchema,
  generateCreateTableStatement,
} from "@lakeql/schema-generator/hive-table"
import {
  generateJsonSchema,
  generateJsonSchemaFromFields,
} from "@lakeql/schema-generator/json-schema"

// 1. Generate JSON Schema from parsed Trino columns
const parsedColumns = {
  id: "bigint",
  name: "varchar",
  score: "double",
  is_active: "boolean",
  created_at: "timestamp(3)",
}

const jsonSchema = generateJsonSchema(parsedColumns)
console.log("JSON Schema from columns:\n", JSON.stringify(jsonSchema, null, 2))

// 2. Generate JSON Schema from FieldDefinitions
const fieldSchema = generateJsonSchemaFromFields([
  { name: "id", type: "Integer" },
  { name: "name", type: "String" },
  {
    name: "email",
    type: "String",
    options: { required: true, validations: [{ type: "email" }] },
  },
  {
    name: "address",
    type: "Object",
    fields: [
      { name: "street", type: "String" },
      { name: "city", type: "String" },
    ],
  },
  { name: "tags", type: "Array", items: { type: "String" } },
])
console.log(
  "\nJSON Schema from fields:\n",
  JSON.stringify(fieldSchema, null, 2)
)

// 3. Generate GraphQL model
const models = generateModel({
  source: jsonSchema,
  name: "Users",
  models: {},
  isRoot: true,
})
console.log("\nGraphQL models:\n", JSON.stringify(models, null, 2))

// 4. Generate Hive CREATE TABLE statement
const createTable = generateCreateTableStatement({
  schema: "analytics",
  tableName: "users",
  bucketName: "my-datalake",
  bucketPath: "warehouse/users",
  definition: {
    id: { type: "integer" },
    name: { type: "string" },
    score: { type: "number" },
    created_at: { type: "string", format: "date-time" },
  },
})
console.log("\nCREATE TABLE:\n", createTable)

// 5. Validate an endpoint definition
const result = endpointDefinitionSchema.safeParse({
  version: "1.0",
  tableName: "users",
  catalog: "hive",
  schema: "analytics",
  fields: [
    { name: "id", type: "Integer" },
    { name: "name", type: "String" },
  ],
})
console.log("\nEndpoint validation:", result.success ? "valid" : result.error)
