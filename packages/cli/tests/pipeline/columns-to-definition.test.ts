import type { JSONType } from "@lakeql/column-parser"
import type { PrimitiveType, TypeMapper } from "@lakeql/datasource"
import { describe, expect, it, vi } from "vitest"

import { columnsToDefinition } from "@/pipeline/columns-to-definition"

/**
 * A small Trino-like mapper used to exercise the structural conversion.
 * The exhaustive engine-type mapping tables live in the adapter packages.
 */
function fakeTypeMapper(): TypeMapper {
  return {
    toPrimitiveType: (engineType: string): PrimitiveType => {
      const normalized = engineType.toLowerCase().replaceAll(/\(.*\)/gu, "")
      switch (normalized) {
        case "integer":
        case "bigint": {
          return "Integer"
        }
        case "double":
        case "float":
        case "decimal": {
          return "Float"
        }
        case "boolean": {
          return "Boolean"
        }
        case "timestamp": {
          return "DateTime"
        }
        case "date": {
          return "Date"
        }
        default: {
          return "String"
        }
      }
    },
    toEngineType: (primitiveType: PrimitiveType): string => primitiveType,
  }
}

describe(columnsToDefinition, () => {
  const baseOptions = {
    tableName: "user_events",
    catalog: "analytics",
    schema: "tracking",
    typeMapper: fakeTypeMapper(),
  }

  it("sets version, tableName, catalog, and schema from options", () => {
    const result = columnsToDefinition({ ...baseOptions, parsedColumns: {} })

    expect(result.version).toBe("1.0")
    expect(result.tableName).toBe("user_events")
    expect(result.catalog).toBe("analytics")
    expect(result.schema).toBe("tracking")
  })

  it("returns empty fields for empty parsedColumns", () => {
    const result = columnsToDefinition({ ...baseOptions, parsedColumns: {} })
    expect(result.fields).toStrictEqual([])
  })

  it("uses the injected type mapper for primitive fields", () => {
    const typeMapper = fakeTypeMapper()
    const spy = vi.spyOn(typeMapper, "toPrimitiveType")
    const parsedColumns: Record<string, JSONType> = { name: "varchar" }

    const result = columnsToDefinition({
      ...baseOptions,
      typeMapper,
      parsedColumns,
    })

    expect(spy).toHaveBeenCalledWith("varchar")
    expect(result.fields).toStrictEqual([{ name: "name", type: "String" }])
  })

  it.each([
    ["varchar", "String"],
    ["integer", "Integer"],
    ["bigint", "Integer"],
    ["double", "Float"],
    ["decimal(10,2)", "Float"],
    ["boolean", "Boolean"],
    ["timestamp(3)", "DateTime"],
    ["date", "Date"],
    ["somecustomtype", "String"],
  ])("maps primitive %s to %s", (engineType, expected) => {
    const parsedColumns: Record<string, JSONType> = { col: engineType }
    const result = columnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([{ name: "col", type: expected }])
  })

  it("maps object (row) to Object with nested fields", () => {
    const parsedColumns: Record<string, JSONType> = {
      address: { street: "varchar", zip: "integer" },
    }
    const result = columnsToDefinition({ ...baseOptions, parsedColumns })
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

  it("maps array of primitives", () => {
    const parsedColumns: Record<string, JSONType> = { tags: ["varchar"] }
    const result = columnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.fields).toStrictEqual([
      { name: "tags", type: "Array", items: { type: "String" } },
    ])
  })

  it("maps array of objects", () => {
    const parsedColumns: Record<string, JSONType> = {
      dimensions: [{ key: "varchar", value: "varchar" }],
    }
    const result = columnsToDefinition({ ...baseOptions, parsedColumns })
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

  it("sets mutation to false for pulled endpoints", () => {
    const parsedColumns: Record<string, JSONType> = { id: "varchar" }
    const result = columnsToDefinition({ ...baseOptions, parsedColumns })
    expect(result.mutation).toBeFalsy()
  })
})
