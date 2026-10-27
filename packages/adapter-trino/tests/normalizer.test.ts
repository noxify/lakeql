import type { ResponseNormalizationInput } from "@lakeql/response-transformer"
import { describe, expect, it } from "vitest"

import { trinoResponseNormalizer } from "../src/normalizer"

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Build a base {@link ResponseNormalizationInput} with sensible defaults.
 * Override any property via the `overrides` parameter.
 */
function input(
  overrides: Partial<ResponseNormalizationInput> = {}
): ResponseNormalizationInput {
  return {
    response: [],
    selectFields: ["id", "name"],
    transformFields: {},
    dateFields: [],
    schema: null,
    ...overrides,
  }
}

/**
 * Build a standard data row that includes the internal metadata columns
 * produced by the Trino dialect's CTE structure.
 */
function row(
  data: Record<string, unknown>,
  totalRecords = 42
): Record<string, unknown> {
  return {
    total_records: totalRecords,
    __lakeql_record_present: true,
    ...data,
  }
}

/**
 * Build the synthetic count-only row produced by the FULL JOIN when the
 * records CTE returned zero rows.
 */
function syntheticRow(totalRecords: number): Record<string, unknown> {
  return {
    total_records: totalRecords,
    __lakeql_record_present: null,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Trino response normalizer", () => {
  it('exposes adapterName "trino"', () => {
    expect(trinoResponseNormalizer.adapterName).toBe("trino")
  })

  // ── Total count extraction ──────────────────────────

  describe("total count extraction", () => {
    it("extracts totalCount from first row's total_records", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ id: 1, name: "a" }, 7)],
        })
      )

      expect(result.totalCount).toBe(7)
      expect(result.data).toHaveLength(1)
    })

    it("empty response returns { totalCount: 0, data: [] }", () => {
      const result = trinoResponseNormalizer.normalize(input({ response: [] }))

      expect(result).toStrictEqual({ totalCount: 0, data: [] })
    })

    it("throws when total_records is missing", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [{ __lakeql_record_present: true, id: 1 }],
          })
        )
      ).toThrow(/total_records/u)
    })

    it("throws when total_records is null", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [
              {
                total_records: null,
                __lakeql_record_present: true,
                id: 1,
              },
            ],
          })
        )
      ).toThrow(/total_records/u)
    })

    it("throws when total_records is a string", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [
              {
                total_records: "42",
                __lakeql_record_present: true,
                id: 1,
              },
            ],
          })
        )
      ).toThrow(/total_records/u)
    })

    it("throws when total_records is negative", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [
              {
                total_records: -1,
                __lakeql_record_present: true,
                id: 1,
              },
            ],
          })
        )
      ).toThrow(/total_records/u)
    })

    it("throws when total_records is Infinity", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [
              {
                total_records: Infinity,
                __lakeql_record_present: true,
                id: 1,
              },
            ],
          })
        )
      ).toThrow(/total_records/u)
    })

    it("throws when total_records is NaN", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [
              {
                total_records: Number.NaN,
                __lakeql_record_present: true,
                id: 1,
              },
            ],
          })
        )
      ).toThrow(/total_records/u)
    })

    it("throws when total_records is non-integer (1.5)", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [
              {
                total_records: 1.5,
                __lakeql_record_present: true,
                id: 1,
              },
            ],
          })
        )
      ).toThrow(/total_records/u)
    })
  })

  // ── Metadata column removal ────────────────────────────────

  describe("metadata column removal", () => {
    it("total_records is removed from output rows", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ id: 1, name: "alice" })],
        })
      )

      const record = result.data[0] as Record<string, unknown>
      expect(record).not.toHaveProperty("total_records")
      expect(record).toHaveProperty("id", 1)
      expect(record).toHaveProperty("name", "alice")
    })

    it("__lakeql_record_present is removed from output rows", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ id: 1, name: "alice" })],
        })
      )

      const record = result.data[0] as Record<string, unknown>
      expect(record).not.toHaveProperty("__lakeql_record_present")
    })
  })

  // ── Synthetic row exclusion ────────────────────────────────

  describe("synthetic row exclusion", () => {
    it("row with __lakeql_record_present: null is excluded", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [syntheticRow(0)],
        })
      )

      expect(result.totalCount).toBe(0)
      expect(result.data).toStrictEqual([])
    })

    it("row with __lakeql_record_present: true is preserved", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ id: 1 }, 1)],
        })
      )

      expect(result.data).toHaveLength(1)
    })

    it("all rows with __lakeql_record_present: true are kept", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ id: 1 }, 3), row({ id: 2 }, 3), row({ id: 3 }, 3)],
        })
      )

      expect(result.data).toHaveLength(3)
    })

    it("row with all fields null but __lakeql_record_present: true is preserved", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [
            {
              total_records: 1,
              __lakeql_record_present: true,
              id: null,
              name: null,
            },
          ],
        })
      )

      expect(result.data).toHaveLength(1)
      const record = result.data[0] as Record<string, unknown>
      expect(record).toStrictEqual({ id: null, name: null })
    })

    it("mixed real and synthetic rows: synthetic excluded, real preserved", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ id: 1 }, 10), row({ id: 2 }, 10), syntheticRow(10)],
        })
      )

      expect(result.totalCount).toBe(10)
      expect(result.data).toHaveLength(2)
    })
  })

  // ── Sentinel validation (strict) ──────────────────────────

  describe("sentinel validation", () => {
    it("rejects __lakeql_record_present: false", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [
              {
                total_records: 1,
                __lakeql_record_present: false,
                id: 1,
              },
            ],
          })
        )
      ).toThrow(/__lakeql_record_present/u)
    })

    it("rejects __lakeql_record_present: 0", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [
              {
                total_records: 1,
                __lakeql_record_present: 0,
                id: 1,
              },
            ],
          })
        )
      ).toThrow(/__lakeql_record_present/u)
    })

    it("rejects __lakeql_record_present: 1", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [
              {
                total_records: 1,
                __lakeql_record_present: 1,
                id: 1,
              },
            ],
          })
        )
      ).toThrow(/__lakeql_record_present/u)
    })

    it('rejects __lakeql_record_present: "true"', () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [
              {
                total_records: 1,
                __lakeql_record_present: "true",
                id: 1,
              },
            ],
          })
        )
      ).toThrow(/__lakeql_record_present/u)
    })

    it("rejects __lakeql_record_present: undefined", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [
              {
                total_records: 1,
                id: 1,
              },
            ],
          })
        )
      ).toThrow(/__lakeql_record_present/u)
    })

    it("accepts __lakeql_record_present: true (real row)", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [
            {
              total_records: 1,
              __lakeql_record_present: true,
              id: 1,
            },
          ],
        })
      )

      expect(result.data).toHaveLength(1)
    })

    it("accepts __lakeql_record_present: null (synthetic row)", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [syntheticRow(0)],
        })
      )

      expect(result.data).toStrictEqual([])
    })
  })

  // ── Row shape validation ──────────────────────────────────────────────

  describe("row shape validation", () => {
    it("throws when first row is null", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [null],
          })
        )
      ).toThrow(/row at index 0/u)
    })

    it("throws when first row is a number", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [42],
          })
        )
      ).toThrow(/row at index 0/u)
    })

    it("throws when a later row is null", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [row({ id: 1 }, 1), null],
          })
        )
      ).toThrow(/row at index 1/u)
    })

    it("throws when first row is a string", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: ["not a row"],
          })
        )
      ).toThrow(/row at index 0/u)
    })

    it("throws when first row is an array", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [[1, 2, 3]],
          })
        )
      ).toThrow(/row at index 0/u)
    })

    it("throws when first row is undefined", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [undefined],
          })
        )
      ).toThrow(/row at index 0/u)
    })
  })

  // ── Date conversion ───────────────────────────

  describe("date conversion", () => {
    it("date field value 1000 → 1_000_000 (×1000)", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ created_at: 1000 })],
          dateFields: ["created_at"],
        })
      )

      const record = result.data[0] as Record<string, unknown>
      expect(record.created_at).toBe(1_000_000)
    })

    it("date field value 0 → 0 (×1000 = 0)", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ created_at: 0 })],
          dateFields: ["created_at"],
        })
      )

      const record = result.data[0] as Record<string, unknown>
      expect(record.created_at).toBe(0)
    })

    it("date field value null → null", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ created_at: null })],
          dateFields: ["created_at"],
        })
      )

      const record = result.data[0] as Record<string, unknown>
      expect(record.created_at).toBeNull()
    })

    it("date field value as string throws", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [row({ created_at: "2024-01-01" })],
            dateFields: ["created_at"],
          })
        )
      ).toThrow(/created_at/u)
    })

    it("date field value NaN throws", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [row({ created_at: Number.NaN })],
            dateFields: ["created_at"],
          })
        )
      ).toThrow(/created_at/u)
    })

    it("date field value Infinity throws", () => {
      expect(() =>
        trinoResponseNormalizer.normalize(
          input({
            response: [row({ created_at: Infinity })],
            dateFields: ["created_at"],
          })
        )
      ).toThrow(/created_at/u)
    })

    it("non-date fields are not converted", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ created_at: 1000, score: 1000 })],
          dateFields: ["created_at"],
        })
      )

      const record = result.data[0] as Record<string, unknown>
      expect(record.created_at).toBe(1_000_000)
      expect(record.score).toBe(1000)
    })

    it("negative date field value is converted", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ created_at: -100 })],
          dateFields: ["created_at"],
        })
      )

      const record = result.data[0] as Record<string, unknown>
      expect(record.created_at).toBe(-100_000)
    })
  })

  // ── Field keys not renamed ─────────────────────────────────

  describe("field key preservation", () => {
    it("keys are NOT renamed via transformFields", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ logical_name: "value" })],
          transformFields: { logical_name: "physical_col" },
        })
      )

      const record = result.data[0] as Record<string, unknown>
      // The key should remain as-is from the response row
      expect(record).toHaveProperty("logical_name", "value")
      // Should NOT have the physical column name as a key
      expect(record).not.toHaveProperty("physical_col")
    })
  })

  // ── Complex values preserved ──────────────────────────────

  describe("complex value preservation", () => {
    it("array values are preserved as-is", () => {
      const arr = [1, 2, 3]
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ tags: arr })],
        })
      )

      const record = result.data[0] as Record<string, unknown>
      expect(record.tags).toStrictEqual([1, 2, 3])
    })

    it("object/map values are preserved as-is", () => {
      const obj = { key: "value", nested: { a: 1 } }
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ metadata: obj })],
        })
      )

      const record = result.data[0] as Record<string, unknown>
      expect(record.metadata).toStrictEqual({ key: "value", nested: { a: 1 } })
    })

    it("null, false, 0, and empty string are preserved", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [row({ a: null, b: false, c: 0, d: "" })],
        })
      )

      const record = result.data[0] as Record<string, unknown>
      expect(record.a).toBeNull()
      expect(record.b).toBeFalsy()
      expect(record.c).toBe(0)
      expect(record.d).toBe("")
    })
  })

  // ── Row order preserved ───────────────────────────────────

  describe("row order preservation", () => {
    it("rows are returned in the same order as the input response", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [
            row({ id: 3, name: "charlie" }, 3),
            row({ id: 1, name: "alice" }, 3),
            row({ id: 2, name: "bob" }, 3),
          ],
        })
      )

      const ids = result.data.map((r) => (r as Record<string, unknown>).id)
      expect(ids).toStrictEqual([3, 1, 2])
    })
  })

  // ── Multi-row integration ─────────────────────────────────────────────

  describe("multi-row integration", () => {
    it("handles multiple rows with date conversion and metadata stripping", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [
            row({ id: 1, created_at: 100, status: "active" }, 2),
            row({ id: 2, created_at: 200, status: "inactive" }, 2),
          ],
          dateFields: ["created_at"],
        })
      )

      expect(result.totalCount).toBe(2)
      expect(result.data).toStrictEqual([
        { id: 1, created_at: 100_000, status: "active" },
        { id: 2, created_at: 200_000, status: "inactive" },
      ])
    })

    it("empty page with totalCount > 0 (synthetic row only)", () => {
      const result = trinoResponseNormalizer.normalize(
        input({
          response: [syntheticRow(42)],
        })
      )

      expect(result.totalCount).toBe(42)
      expect(result.data).toStrictEqual([])
    })
  })
})
