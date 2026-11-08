import { describe, expect, it } from "vitest"

import { transformRecords } from "../src/transform-records"
import type { TransformSchema } from "../src/transform-records"

describe(transformRecords, () => {
  describe("scalar fields", () => {
    it("copies scalar values through unchanged", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
          active: { type: "boolean" },
        },
      }

      const result = transformRecords({
        records: [{ name: "Alice", age: 30, active: true }],
        schema,
      })

      expect(result).toStrictEqual([{ name: "Alice", age: 30, active: true }])
    })

    it("normalizes null and undefined scalar values to null", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "string" },
          c: { type: "string" },
        },
      }

      const result = transformRecords({
        records: [{ a: null, b: undefined, c: "x" }],
        schema,
      })

      expect(result).toStrictEqual([{ a: null, b: null, c: "x" }])
    })

    it("normalizes fields missing from the record to null", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          present: { type: "string" },
          absent: { type: "number" },
        },
      }

      const result = transformRecords({
        records: [{ present: "here" }],
        schema,
      })

      expect(result).toStrictEqual([{ present: "here", absent: null }])
    })

    it("preserves numeric zero, boolean false, and empty string", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          count: { type: "number" },
          flag: { type: "boolean" },
          label: { type: "string" },
        },
      }

      const result = transformRecords({
        records: [{ count: 0, flag: false, label: "" }],
        schema,
      })

      expect(result).toStrictEqual([{ count: 0, flag: false, label: "" }])
    })
  })

  describe("unknown fields", () => {
    it("skips fields present on the record but absent from the schema", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          keep: { type: "string" },
        },
      }

      const result = transformRecords({
        records: [{ keep: "yes", drop: "no", extra: 42 }],
        schema,
      })

      expect(result).toStrictEqual([{ keep: "yes" }])
    })
  })

  describe("nested objects", () => {
    it("transforms nested object fields recursively", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          id: { type: "number" },
          address: {
            type: "object",
            properties: {
              city: { type: "string" },
              zip: { type: "string" },
            },
          },
        },
      }

      const result = transformRecords({
        records: [
          {
            id: 1,
            address: { city: "Berlin", zip: "10115", ignored: "x" },
          },
        ],
        schema,
      })

      expect(result).toStrictEqual([
        { id: 1, address: { city: "Berlin", zip: "10115" } },
      ])
    })

    it("normalizes a null object field to null", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          nested: {
            type: "object",
            properties: { x: { type: "string" } },
          },
        },
      }

      const result = transformRecords({
        records: [{ nested: null }],
        schema,
      })

      expect(result).toStrictEqual([{ nested: null }])
    })
  })

  describe("arrays", () => {
    it("passes arrays of scalars through unchanged", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          tags: { type: "array", items: { type: "string" } },
        },
      }

      const result = transformRecords({
        records: [{ tags: ["a", "b", "c"] }],
        schema,
      })

      expect(result).toStrictEqual([{ tags: ["a", "b", "c"] }])
    })

    it("transforms arrays of objects element-by-element", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sku: { type: "string" },
                qty: { type: "number" },
              },
            },
          },
        },
      }

      const result = transformRecords({
        records: [
          {
            items: [
              { sku: "A", qty: 2, ignored: true },
              { sku: "B", qty: 5 },
            ],
          },
        ],
        schema,
      })

      expect(result).toStrictEqual([
        {
          items: [
            { sku: "A", qty: 2 },
            { sku: "B", qty: 5 },
          ],
        },
      ])
    })

    it("handles an empty array", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "object", properties: { x: { type: "string" } } },
          },
        },
      }

      const result = transformRecords({
        records: [{ items: [] }],
        schema,
      })

      expect(result).toStrictEqual([{ items: [] }])
    })
  })

  describe("raw complex values", () => {
    it("preserves a raw object value when the schema type is scalar", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          payload: { type: "string" },
        },
      }

      const raw = { nested: { deep: [1, 2, 3] } }
      const result = transformRecords({
        records: [{ payload: raw }],
        schema,
      })

      expect(result).toStrictEqual([{ payload: raw }])
    })
  })

  describe("field mapping (source -> target)", () => {
    it("renames top-level fields", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          user_name: { type: "string" },
        },
      }

      const result = transformRecords({
        records: [{ user_name: "Alice" }],
        schema,
        fieldMapping: { user_name: "userName" },
      })

      expect(result).toStrictEqual([{ userName: "Alice" }])
    })

    it("renames nested object fields", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          addr: {
            type: "object",
            properties: {
              zip_code: { type: "string" },
            },
          },
        },
      }

      const result = transformRecords({
        records: [{ addr: { zip_code: "10115" } }],
        schema,
        fieldMapping: { addr: "address", zip_code: "zipCode" },
      })

      expect(result).toStrictEqual([{ address: { zipCode: "10115" } }])
    })

    it("renames fields inside array items", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          rows: {
            type: "array",
            items: {
              type: "object",
              properties: { field_a: { type: "string" } },
            },
          },
        },
      }

      const result = transformRecords({
        records: [{ rows: [{ field_a: "x" }, { field_a: "y" }] }],
        schema,
        fieldMapping: { field_a: "fieldA" },
      })

      expect(result).toStrictEqual([
        { rows: [{ fieldA: "x" }, { fieldA: "y" }] },
      ])
    })

    it("uses the original name when no mapping entry exists", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: {
          kept: { type: "string" },
        },
      }

      const result = transformRecords({
        records: [{ kept: "v" }],
        schema,
        fieldMapping: { other: "renamed" },
      })

      expect(result).toStrictEqual([{ kept: "v" }])
    })
  })

  describe("multiple records", () => {
    it("transforms every record in the input array", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: { n: { type: "number" } },
      }

      const result = transformRecords({
        records: [{ n: 1 }, { n: 2 }, { n: 3 }],
        schema,
      })

      expect(result).toStrictEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
    })

    it("returns an empty array for empty input", () => {
      const schema: TransformSchema = {
        type: "object",
        properties: { n: { type: "number" } },
      }

      const result = transformRecords({ records: [], schema })

      expect(result).toStrictEqual([])
    })
  })
})
