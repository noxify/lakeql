import type { PrimitiveType } from "@lakeql/datasource"
import { describe, expect, it } from "vitest"

import { fabricTypeMapper } from "../src/type-mapper"

describe("Fabric type mapper", () => {
  const mapper = fabricTypeMapper

  describe("toPrimitiveType", () => {
    it.each([
      ["nvarchar", "String"],
      ["varchar", "String"],
      ["char", "String"],
      ["nchar", "String"],
      ["text", "String"],
      ["ntext", "String"],
      ["xml", "String"],
      ["uniqueidentifier", "String"],
      ["varbinary", "String"],
      ["binary", "String"],
      ["int", "Integer"],
      ["bigint", "Integer"],
      ["smallint", "Integer"],
      ["tinyint", "Integer"],
      ["float", "Float"],
      ["real", "Float"],
      ["decimal", "Float"],
      ["numeric", "Float"],
      ["money", "Float"],
      ["smallmoney", "Float"],
      ["bit", "Boolean"],
      ["date", "Date"],
      ["datetime", "DateTime"],
      ["datetime2", "DateTime"],
      ["datetimeoffset", "DateTime"],
      ["smalldatetime", "DateTime"],
      ["time", "DateTime"],
    ] as [string, PrimitiveType][])("maps %s to %s", (engineType, expected) => {
      expect(mapper.toPrimitiveType(engineType)).toBe(expected)
    })

    it("strips type parameters", () => {
      expect(mapper.toPrimitiveType("nvarchar(255)")).toBe("String")
      expect(mapper.toPrimitiveType("decimal(18,4)")).toBe("Float")
      expect(mapper.toPrimitiveType("datetime2(7)")).toBe("DateTime")
    })

    it("is case-insensitive", () => {
      expect(mapper.toPrimitiveType("NVARCHAR")).toBe("String")
      expect(mapper.toPrimitiveType("BigInt")).toBe("Integer")
    })

    it("falls back to String for unknown types", () => {
      expect(mapper.toPrimitiveType("geography")).toBe("String")
      expect(mapper.toPrimitiveType("")).toBe("String")
    })
  })

  describe("toEngineType", () => {
    it.each([
      ["String", "NVARCHAR(MAX)"],
      ["Integer", "BIGINT"],
      ["Float", "FLOAT"],
      ["Boolean", "BIT"],
      ["Date", "DATE"],
      ["DateTime", "DATETIME2(3)"],
    ] as [PrimitiveType, string][])(
      "maps %s to %s",
      (primitiveType, expected) => {
        expect(mapper.toEngineType(primitiveType)).toBe(expected)
      }
    )
  })

  it("exposes the TypeMapper methods", () => {
    expect(fabricTypeMapper.toPrimitiveType).toBeTypeOf("function")
    expect(fabricTypeMapper.toEngineType).toBeTypeOf("function")
  })
})
