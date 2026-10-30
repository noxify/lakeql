import { describe, expect, it } from "vitest"

import { renderRow, renderValue, renderValuesClause } from "../src/value-render"

describe(renderValue, () => {
  it("renders null and undefined as NULL", () => {
    expect(renderValue(null, "c")).toBe("NULL")
    expect(renderValue(undefined, "c")).toBe("NULL")
  })

  it("renders strings as escaped single-quoted literals", () => {
    expect(renderValue("hello", "c")).toBe("'hello'")
    expect(renderValue("it's", "c")).toBe("'it''s'")
  })

  it("renders booleans as TRUE/FALSE", () => {
    expect(renderValue(true, "c")).toBe("TRUE")
    expect(renderValue(false, "c")).toBe("FALSE")
  })

  it("renders finite numbers", () => {
    expect(renderValue(42, "c")).toBe("42")
    expect(renderValue(-3.14, "c")).toBe("-3.14")
    expect(renderValue(0, "c")).toBe("0")
  })

  it("rejects NaN and Infinity", () => {
    expect(() => renderValue(Number.NaN, "amount")).toThrow('column "amount"')
    expect(() => renderValue(Number.POSITIVE_INFINITY, "amount")).toThrow(
      "non-finite"
    )
    expect(() => renderValue(Number.NEGATIVE_INFINITY, "amount")).toThrow(
      "non-finite"
    )
  })

  it("renders bigint as a decimal literal", () => {
    expect(renderValue(9_007_199_254_740_993n, "c")).toBe("9007199254740993")
  })

  it("renders a valid Date as a TIMESTAMP literal", () => {
    const date = new Date("2024-03-15T08:30:00.123Z")
    expect(renderValue(date, "c")).toBe("TIMESTAMP '2024-03-15 08:30:00.123'")
  })

  it("rejects an invalid Date", () => {
    expect(() => renderValue(new Date("not-a-date"), "ts")).toThrow(
      'invalid Date for column "ts"'
    )
  })

  it("rejects unsupported object types", () => {
    expect(() => renderValue({ a: 1 }, "c")).toThrow("unsupported object type")
  })

  it("rejects unsupported primitive types", () => {
    expect(() => renderValue(Symbol("x"), "c")).toThrow("unsupported type")
  })
})

describe(renderRow, () => {
  it("renders a tuple in the given column order", () => {
    const row = { id: 1, name: "a", active: true }
    expect(renderRow(row, ["id", "name", "active"])).toBe("(1, 'a', TRUE)")
  })

  it("emits NULL for missing columns", () => {
    expect(renderRow({ id: 1 }, ["id", "name"])).toBe("(1, NULL)")
  })
})

describe(renderValuesClause, () => {
  it("joins multiple rows", () => {
    const rows = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]
    expect(renderValuesClause(rows, ["id", "name"])).toBe("(1, 'a'), (2, 'b')")
  })

  it("renders an empty batch as an empty string", () => {
    expect(renderValuesClause([], ["id"])).toBe("")
  })
})
