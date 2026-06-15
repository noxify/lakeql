import type { JSONType } from "@lakeql/column-parser"
import { describe, expect, it } from "vitest"

import { trinoColumnsToDefinition } from "@/pipeline/trino-to-definition"

describe(trinoColumnsToDefinition, () => {
  const baseOptions = {
    tableName: "user_events",
    catalog: "analytics",
    schema: "tracking",
  }

  it("should set version, tableName, catalog, and schema from options", () => {
    const result = trinoColumnsToDefinition({
      ...baseOptions,
      parsedColumns: {},
    })

    expect(result.version).toBe("1.0")
    expect(result.tableName).toBe("user_events")
    expect(result.catalog).toBe("analytics")
    expect(result.schema).toBe("tracking")
  })

  it("should return empty fields for empty parsedColumns", () => {
    const result = trinoColumnsToDefinition({
      ...baseOptions,
      parsedColumns: {},
    })

    expect(result.fields).toStrictEqual([])
  })

  it("should map varchar to String", () => {
    const parsedColumns: Record<string, JSONType> = { name: "varchar" }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([{ name: "name", type: "String" }])
  })

  it("should map integer to Integer", () => {
    const parsedColumns: Record<string, JSONType> = { count: "integer" }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([{ name: "count", type: "Integer" }])
  })

  it("should map bigint to Integer", () => {
    const parsedColumns: Record<string, JSONType> = { big_count: "bigint" }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([
      { name: "big_count", type: "Integer" },
    ])
  })

  it("should map double to Float", () => {
    const parsedColumns: Record<string, JSONType> = { price: "double" }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([{ name: "price", type: "Float" }])
  })

  it("should map decimal with parameters to Float", () => {
    const parsedColumns: Record<string, JSONType> = { amount: "decimal(10,2)" }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([{ name: "amount", type: "Float" }])
  })

  it("should map boolean to Boolean", () => {
    const parsedColumns: Record<string, JSONType> = { is_active: "boolean" }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([
      { name: "is_active", type: "Boolean" },
    ])
  })

  it("should map timestamp to DateTime", () => {
    const parsedColumns: Record<string, JSONType> = {
      created_at: "timestamp(3)",
    }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([
      { name: "created_at", type: "DateTime" },
    ])
  })

  it("should map date to Date", () => {
    const parsedColumns: Record<string, JSONType> = { birth_date: "date" }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([{ name: "birth_date", type: "Date" }])
  })

  it("should map object (row) to Object with nested fields", () => {
    const parsedColumns: Record<string, JSONType> = {
      address: { street: "varchar", zip: "integer" },
    }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([
      {
        name: "address",
        type: "Object",
        fields: [
          { name: "street", type: "String" },
          { name: "zip", type: "Integer" },
        ],
      },
    ])
  })

  it("should map array of primitives", () => {
    const parsedColumns: Record<string, JSONType> = { tags: ["varchar"] }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([
      { name: "tags", type: "Array", items: { type: "String" } },
    ])
  })

  it("should map array of objects", () => {
    const parsedColumns: Record<string, JSONType> = {
      dimensions: [{ key: "varchar", value: "varchar" }],
    }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([
      {
        name: "dimensions",
        type: "Array",
        items: {
          type: "Object",
          fields: [
            { name: "key", type: "String" },
            { name: "value", type: "String" },
          ],
        },
      },
    ])
  })

  it("should fallback unknown types to String", () => {
    const parsedColumns: Record<string, JSONType> = {
      unknown_col: "somecustomtype",
    }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([
      { name: "unknown_col", type: "String" },
    ])
  })

  it("should map float type to Float", () => {
    const parsedColumns: Record<string, JSONType> = { ratio: "float" }
    const result = trinoColumnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([{ name: "ratio", type: "Float" }])
  })
})
