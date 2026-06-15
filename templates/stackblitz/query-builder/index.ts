/**
 * LakeQL Bug Reproduction - @lakeql/query-builder
 *
 * This package generates Trino-compatible SQL from structured query inputs.
 * Replace the code below with your reproduction.
 */

import { generateQuery, formatQuery } from "@lakeql/query-builder"

// Define a query with filtering, sorting, and pagination
const compiled = generateQuery({
  catalog: "hive",
  schema: "sales",
  table: "orders",
  selectFields: ["id", "customer_name", "amount", "created_at"],
  userQuery: {
    and: [{ amount: { gte: "100" } }, { customer_name: { like: "Alice" } }],
  },
  sorting: [{ field: "created_at", direction: "DESC" }],
  paging: { limit: 25, offset: 0 },
})

// Format the compiled query for readability
const formattedSql = formatQuery({ query: compiled })
console.log("Generated SQL:\n")
console.log(formattedSql)
