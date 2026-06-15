import { describe, expect, it } from "vitest"

import { recordsToColumnar } from "../src/columnar"
import type { JsonSchema } from "../src/converter"

// oxlint-disable vitest/max-expects

describe(recordsToColumnar, () => {
  it("should extract primitive string fields as-is", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    }
    const records = [{ name: "Alice" }, { name: "Bob" }]
    const result = recordsToColumnar(records, schema)

    expect(result).toStrictEqual([{ name: "name", data: ["Alice", "Bob"] }])
  })

  it("should convert date-time strings to Date objects", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        createdAt: { type: "string", format: "date-time" },
      },
      required: ["createdAt"],
    }
    const records = [
      { createdAt: "2024-01-15T10:30:00.000Z" },
      { createdAt: "2024-06-20T14:00:00.000Z" },
    ]
    const result = recordsToColumnar(records, schema)

    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe("createdAt")
    expect(result[0]?.data[0]).toStrictEqual(
      new Date("2024-01-15T10:30:00.000Z")
    )
    expect(result[0]?.data[1]).toStrictEqual(
      new Date("2024-06-20T14:00:00.000Z")
    )
  })

  it("should convert integer fields to BigInt", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        quantity: { type: "integer" },
      },
      required: ["quantity"],
    }
    const records = [{ quantity: 42 }, { quantity: 100 }]
    const result = recordsToColumnar(records, schema)

    expect(result).toStrictEqual([{ name: "quantity", data: [42n, 100n] }])
  })

  it("should pass through number fields as-is", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        price: { type: "number" },
      },
      required: ["price"],
    }
    const records = [{ price: 9.99 }, { price: 14.5 }]
    const result = recordsToColumnar(records, schema)

    expect(result).toStrictEqual([{ name: "price", data: [9.99, 14.5] }])
  })

  it("should pass through boolean fields as-is", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        inStock: { type: "boolean" },
      },
      required: ["inStock"],
    }
    const records = [{ inStock: true }, { inStock: false }]
    const result = recordsToColumnar(records, schema)

    expect(result).toStrictEqual([{ name: "inStock", data: [true, false] }])
  })

  it("should handle null values for optional fields", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
      },
      required: ["name"],
    }
    const records = [
      { name: "Alice", age: 30 },
      { name: "Bob" }, // age is missing
    ]
    const result = recordsToColumnar(records, schema)

    expect(result).toStrictEqual([
      { name: "name", data: ["Alice", "Bob"] },
      { name: "age", data: [30n, null] },
    ])
  })

  it("should handle multiple fields of different types", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        quantity: { type: "integer" },
        price: { type: "number" },
        date: { type: "string", format: "date-time" },
        inStock: { type: "boolean" },
      },
      required: ["name", "quantity", "price", "date", "inStock"],
    }
    const records = [
      {
        name: "item-0",
        quantity: 10,
        price: 0.5,
        date: "2024-01-01T00:00:00.000Z",
        inStock: true,
      },
    ]
    const result = recordsToColumnar(records, schema)

    expect(result).toHaveLength(5)
    expect(result[0]).toStrictEqual({ name: "name", data: ["item-0"] })
    expect(result[1]).toStrictEqual({ name: "quantity", data: [10n] })
    expect(result[2]).toStrictEqual({ name: "price", data: [0.5] })
    expect(result[3]).toStrictEqual({
      name: "date",
      data: [new Date("2024-01-01T00:00:00.000Z")],
    })
    expect(result[4]).toStrictEqual({ name: "inStock", data: [true] })
  })

  it("should handle arrays of primitives", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        colours: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["colours"],
    }
    const records = [{ colours: ["red", "blue"] }, { colours: ["green"] }]
    const result = recordsToColumnar(records, schema)

    expect(result).toStrictEqual([
      {
        name: "colours",
        data: [["red", "blue"], ["green"]],
      },
    ])
  })

  it("should handle arrays of objects with type conversions", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        stock: {
          type: "array",
          items: {
            type: "object",
            properties: {
              price: { type: "number" },
              quantity: { type: "integer" },
            },
            required: ["price", "quantity"],
          },
        },
      },
      required: ["stock"],
    }
    const records = [
      {
        stock: [
          { price: 9.99, quantity: 100 },
          { price: 14.5, quantity: 50 },
        ],
      },
    ]
    const result = recordsToColumnar(records, schema)

    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe("stock")
    expect(result[0]?.data).toStrictEqual([
      [
        { price: 9.99, quantity: 100n },
        { price: 14.5, quantity: 50n },
      ],
    ])
  })

  it("should handle nested objects with type conversions", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            zipCode: { type: "integer" },
          },
          required: ["street", "zipCode"],
        },
      },
      required: ["address"],
    }
    const records = [{ address: { street: "123 Main St", zipCode: 12_345 } }]
    const result = recordsToColumnar(records, schema)

    expect(result).toStrictEqual([
      {
        name: "address",
        data: [{ street: "123 Main St", zipCode: 12_345n }],
      },
    ])
  })

  it("should handle empty records array", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        quantity: { type: "integer" },
      },
      required: ["name", "quantity"],
    }
    const result = recordsToColumnar([], schema)

    expect(result).toStrictEqual([
      { name: "name", data: [] },
      { name: "quantity", data: [] },
    ])
  })

  it("should handle nullable union types", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        nickname: { type: ["string", "null"] },
      },
    }
    const records = [{ nickname: "Bob" }, { nickname: null }]
    const result = recordsToColumnar(records, schema)

    expect(result).toStrictEqual([{ name: "nickname", data: ["Bob", null] }])
  })

  it("should handle arrays of integers with BigInt conversion", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        scores: {
          type: "array",
          items: { type: "integer" },
        },
      },
      required: ["scores"],
    }
    const records = [{ scores: [10, 20, 30] }]
    const result = recordsToColumnar(records, schema)

    expect(result).toStrictEqual([{ name: "scores", data: [[10n, 20n, 30n]] }])
  })

  it("should handle nested objects with date-time fields", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        event: {
          type: "object",
          properties: {
            name: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
          },
          required: ["name", "timestamp"],
        },
      },
      required: ["event"],
    }
    const records = [
      { event: { name: "login", timestamp: "2024-03-15T09:00:00.000Z" } },
    ]
    const result = recordsToColumnar(records, schema)

    expect(result).toStrictEqual([
      {
        name: "event",
        data: [
          { name: "login", timestamp: new Date("2024-03-15T09:00:00.000Z") },
        ],
      },
    ])
  })
})
