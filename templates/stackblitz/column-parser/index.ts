/**
 * LakeQL Bug Reproduction - @lakeql/column-parser
 *
 * This package parses Trino column type definitions into structured objects.
 * Replace the code below with your reproduction.
 */

import { parseColumns } from "@lakeql/column-parser"

// Simple columns
const simpleColumns = parseColumns([
  { name: "id", type: "bigint", extra: "", description: "Primary key" },
  { name: "name", type: "varchar", extra: "", description: "User name" },
  { name: "is_active", type: "boolean", extra: "", description: "" },
  { name: "score", type: "double", extra: "", description: "" },
  { name: "created_at", type: "timestamp(3)", extra: "", description: "" },
])

console.log("Simple columns:", JSON.stringify(simpleColumns, null, 2))

// Nested columns (ROW type)
const nestedColumns = parseColumns([
  {
    name: "address",
    type: "row(street varchar, city varchar, zip varchar)",
    extra: "",
    description: "User address",
  },
])

console.log("Nested columns:", JSON.stringify(nestedColumns, null, 2))

// Array columns
const arrayColumns = parseColumns([
  {
    name: "tags",
    type: "array(varchar)",
    extra: "",
    description: "List of tags",
  },
  {
    name: "items",
    type: "array(row(name varchar, quantity integer))",
    extra: "",
    description: "Order items",
  },
])

console.log("Array columns:", JSON.stringify(arrayColumns, null, 2))
