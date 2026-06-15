/**
 * LakeQL Bug Reproduction - @lakeql/response-transformer
 *
 * This package transforms Trino array responses into typed objects.
 * Replace the code below with your reproduction.
 */

import {
  convertTrinoResponse,
  transform,
  transformObject,
} from "@lakeql/response-transformer"

// 1. Convert positional array to named object
const record = convertTrinoResponse({
  keys: ["id", "name", "email", "created_at"],
  values: [42, "Alice", "alice@example.com", 1700000000],
})
console.log("Converted record:", record)

// 2. Transform with JSON Schema definition (handles type coercion)
const definition = {
  type: "object" as const,
  properties: {
    id: { type: "integer" as const },
    name: { type: "string" as const },
    email: { type: "string" as const },
    created_at: { type: "string" as const, format: "date-time" },
  },
}

const transformed = transform({
  data: record as Record<string, unknown>,
  definition,
  dateFields: ["created_at"],
})
console.log("Transformed:", transformed)

// 3. Transform nested object (simulates Trino ROW response)
const nestedDefinition = {
  type: "object" as const,
  properties: {
    street: { type: "string" as const },
    city: { type: "string" as const },
    zip: { type: "string" as const },
  },
}

const nestedData = ["Main St", "Berlin", "10115"]
const nestedResult = transformObject({
  data: nestedData as unknown as Record<string, unknown>,
  definition: nestedDefinition,
})
console.log("Nested transform:", nestedResult)

// 4. Transform with field name mapping (e.g., DB column → GraphQL name)
const mappedResult = transform({
  data: { user_name: "Bob", user_email: "bob@test.com" },
  definition: {
    type: "object" as const,
    properties: {
      user_name: { type: "string" as const },
      user_email: { type: "string" as const },
    },
  },
  transformFields: { user_name: "userName", user_email: "userEmail" },
})
console.log("Mapped transform:", mappedResult)
