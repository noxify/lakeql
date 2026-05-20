import type { JSONSchema7 } from "json-schema"
import { beforeEach, describe, expect, test, vi } from "vitest"

import {
  generateCreateTableStatement,
  generateSqlSchema,
  parquetTransformer,
} from "../src/hive-table"

describe(generateSqlSchema, () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("should handle basic types", () => {
    const definition = {
      active: { type: "boolean" },
      age: { type: "integer" },
      name: { type: "string" },
      score: { type: "number" },
    }

    const result = generateSqlSchema({ definition })

    expect(result).toStrictEqual([
      ["active", "boolean"],
      ["age", "bigint"],
      ["name", "varchar"],
      ["score", "double"],
    ])
  })

  test("should handle date-time format", () => {
    const definition = {
      createdAt: { format: "date-time", type: "string" },
    }

    const result = generateSqlSchema({ definition })

    expect(result).toStrictEqual([["createdAt", "timestamp(3)"]])
  })

  test("should handle arrays of primitives", () => {
    const definition = {
      numbers: { items: { type: "integer" }, type: "array" },
      tags: { items: { type: "string" }, type: "array" },
    }

    const result = generateSqlSchema({ definition })

    expect(result).toStrictEqual([
      ["numbers", "array(bigint)"],
      ["tags", "array(varchar)"],
    ])
  })

  test("should handle objects", () => {
    const definition = {
      user: {
        properties: {
          age: { type: "integer" },
          name: { type: "string" },
        },
        type: "object",
      },
    }

    const result = generateSqlSchema({ definition })

    expect(result).toStrictEqual([["user", "ROW(age bigint, name varchar)"]])
  })

  test("should handle arrays of objects", () => {
    const definition = {
      users: {
        items: {
          properties: {
            age: { type: "integer" },
            name: { type: "string" },
          },
          type: "object",
        },
        type: "array",
      },
    }

    const result = generateSqlSchema({ definition })

    expect(result).toStrictEqual([
      ["users", "array(ROW(age bigint, name varchar))"],
    ])
  })

  test("should handle unknown types with warning", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      /* noop */
    })

    const definition = {
      unknown: { type: "unknown" },
    }

    const result = generateSqlSchema({ definition })

    expect(result).toStrictEqual([["unknown", "varchar"]])
    expect(consoleSpy).toHaveBeenCalledWith(
      'Unknown type "unknown" for field "unknown", defaulting to varchar'
    )
  })

  test("should throw error for array without items", () => {
    const definition = {
      badArray: { type: "array" },
    }

    expect(() => generateSqlSchema({ definition })).toThrow(
      'Failed to process field "badArray": Array field "badArray" missing items definition'
    )
  })

  test("should throw error for object without properties", () => {
    const definition = {
      badObject: { type: "object" },
    }

    expect(() => generateSqlSchema({ definition })).toThrow(
      'Failed to process field "badObject": Object field "badObject" missing properties definition'
    )
  })

  test("should throw error for array with empty items array", () => {
    const definition = {
      emptyArray: { items: [], type: "array" },
    }

    expect(() => generateSqlSchema({ definition })).toThrow(
      'Failed to process field "emptyArray": Array field "emptyArray" has empty items array'
    )
  })
})

describe(parquetTransformer, () => {
  test("should handle primitive types", () => {
    const definition = {
      age: { type: "integer" },
      name: { type: "string" },
    } as Record<string, JSONSchema7>

    const result = parquetTransformer({ definition })

    expect(result).toStrictEqual({
      age: "age",
      name: "name",
    })
  })

  test("should handle objects", () => {
    const definition = {
      user: {
        properties: {
          age: { type: "integer" },
          name: { type: "string" },
        },
        type: "object",
      },
    } as Record<string, JSONSchema7>

    const result = parquetTransformer({ definition })

    expect(result).toStrictEqual({
      user: ["user", { age: "age", name: "name" }],
    })
  })

  test("should handle arrays", () => {
    const definition = {
      tags: {
        items: { type: "string" },
        type: "array",
      },
    } as Record<string, JSONSchema7>

    const result = parquetTransformer({ definition })

    expect(result).toStrictEqual({
      tags: ["tags", { "list[]": { element: {} } }],
    })
  })

  test("should handle arrays of objects", () => {
    const definition = {
      users: {
        items: {
          properties: {
            name: { type: "string" },
          },
          type: "object",
        },
        type: "array",
      },
    } as Record<string, JSONSchema7>

    const result = parquetTransformer({ definition })

    expect(result).toStrictEqual({
      users: ["users", { "list[]": { element: { name: "name" } } }],
    })
  })
})

describe(generateCreateTableStatement, () => {
  test("should generate basic CREATE TABLE statement", () => {
    const definition = {
      age: { type: "integer" },
      name: { type: "string" },
    }

    const result = generateCreateTableStatement({
      bucketName: "my-bucket",
      bucketPath: "data/table",
      definition,
      schema: "test_schema",
      tableName: "test_table",
    })

    expect(result).toContain(
      'CREATE TABLE IF NOT EXISTS "test_schema"."test_table"'
    )

    expect(result).toContain('"age" bigint')
    expect(result).toContain('"name" varchar')
    expect(result).toContain("external_location = 's3://my-bucket/data/table'")
  })

  test("should handle complex schema", () => {
    const definition = {
      tags: { items: { type: "string" }, type: "array" },
      user: {
        properties: {
          age: { type: "integer" },
          name: { type: "string" },
        },
        type: "object",
      },
    }

    const result = generateCreateTableStatement({
      bucketName: "data-lake",
      bucketPath: "users/2024",
      definition,
      schema: "analytics",
      tableName: "users",
    })

    expect(result).toContain('"analytics"."users"')
    expect(result).toContain('"user" ROW(age bigint, name varchar)')
    expect(result).toContain('"tags" array(varchar)')
    expect(result).toContain("external_location = 's3://data-lake/users/2024'")
  })

  test("should handle path joining correctly", () => {
    const definition = {
      id: { type: "string" },
    }

    const result = generateCreateTableStatement({
      bucketName: "bucket",
      bucketPath: "nested/deep/path",
      definition,
      schema: "test",
      tableName: "simple",
    })

    expect(result).toContain(
      "external_location = 's3://bucket/nested/deep/path'"
    )
  })
})
