import type { PrimitiveType } from "@lakeql/datasource"
import { describe, expect, it } from "vitest"

import { trinoTypeMapper } from "../src/type-mapper"

describe("Trino type mapper", () => {
  const mapper = trinoTypeMapper

  describe("toPrimitiveType", () => {
    it.each([
      ["varchar", "String"],
      ["char", "String"],
      ["text", "String"],
      ["json", "String"],
      ["uuid", "String"],
      ["varbinary", "String"],
      ["bigint", "Integer"],
      ["integer", "Integer"],
      ["int", "Integer"],
      ["smallint", "Integer"],
      ["tinyint", "Integer"],
      ["double", "Float"],
      ["real", "Float"],
      ["decimal", "Float"],
      ["numeric", "Float"],
      ["boolean", "Boolean"],
      ["date", "Date"],
      ["timestamp", "DateTime"],
      ["timestamp with time zone", "DateTime"],
    ] as [string, PrimitiveType][])("maps %s to %s", (engineType, expected) => {
      expect(mapper.toPrimitiveType(engineType)).toBe(expected)
    })

    it("strips type parameters", () => {
      expect(mapper.toPrimitiveType("varchar(255)")).toBe("String")
      expect(mapper.toPrimitiveType("decimal(10,2)")).toBe("Float")
      expect(mapper.toPrimitiveType("timestamp(3)")).toBe("DateTime")
    })

    it("is case-insensitive", () => {
      expect(mapper.toPrimitiveType("VARCHAR")).toBe("String")
      expect(mapper.toPrimitiveType("BigInt")).toBe("Integer")
    })

    it("falls back to String for unknown types", () => {
      expect(mapper.toPrimitiveType("hyperloglog")).toBe("String")
      expect(mapper.toPrimitiveType("")).toBe("String")
    })
  })

  describe("toEngineType", () => {
    it.each([
      ["String", "VARCHAR"],
      ["Integer", "BIGINT"],
      ["Float", "DOUBLE"],
      ["Boolean", "BOOLEAN"],
      ["Date", "DATE"],
      ["DateTime", "TIMESTAMP(3)"],
    ] as [PrimitiveType, string][])(
      "maps %s to %s",
      (primitiveType, expected) => {
        expect(mapper.toEngineType(primitiveType)).toBe(expected)
      }
    )
  })

  it("exposes the TypeMapper methods", () => {
    expect(trinoTypeMapper.toPrimitiveType).toBeTypeOf("function")
    expect(trinoTypeMapper.toEngineType).toBeTypeOf("function")
  })
})
