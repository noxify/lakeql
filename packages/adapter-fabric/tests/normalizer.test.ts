import type { ResponseNormalizationInput } from "@lakeql/response-transformer"
import { describe, expect, it } from "vitest"

import { fabricResponseNormalizer } from "../src/normalizer"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a base {@link ResponseNormalizationInput} with sensible defaults. */
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
 * Build a data row with the internal metadata columns. Fabric's TDS driver
 * returns the presence sentinel as the integer `1` rather than a boolean.
 */
function row(
  data: Record<string, unknown>,
  totalRecords = 42,
  sentinel: unknown = 1
): Record<string, unknown> {
  return {
    total_records: totalRecords,
    __lakeql_record_present: sentinel,
    ...data,
  }
}

function syntheticRow(totalRecords: number): Record<string, unknown> {
  return {
    total_records: totalRecords,
    __lakeql_record_present: null,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Fabric response normalizer", () => {
  it('exposes adapterName "fabric"', () => {
    expect(fabricResponseNormalizer.adapterName).toBe("fabric")
  })

  // ── Shared CTE decoding (representative coverage; the full shared logic is
  //    exercised by the Trino suite and @lakeql/response-transformer) ────────

  describe("shared CTE decoding", () => {
    it("returns empty result for an empty response", () => {
      const result = fabricResponseNormalizer.normalize(input({ response: [] }))
      expect(result).toStrictEqual({ totalCount: 0, data: [] })
    })

    it("extracts totalCount from the first row", () => {
      const result = fabricResponseNormalizer.normalize(
        input({ response: [row({ id: 1 }, 7)] })
      )
      expect(result.totalCount).toBe(7)
    })

    it("removes metadata columns from output rows", () => {
      const result = fabricResponseNormalizer.normalize(
        input({ response: [row({ id: 1 })] })
      )
      const record = result.data[0] as Record<string, unknown>
      expect(record).not.toHaveProperty("total_records")
      expect(record).not.toHaveProperty("__lakeql_record_present")
      expect(record).toStrictEqual({ id: 1 })
    })

    it("excludes the synthetic count-only row", () => {
      const result = fabricResponseNormalizer.normalize(
        input({ response: [syntheticRow(0)] })
      )
      expect(result).toStrictEqual({ totalCount: 0, data: [] })
    })

    it("converts date fields from seconds to milliseconds", () => {
      const result = fabricResponseNormalizer.normalize(
        input({
          response: [row({ id: 1, created_at: 1000 })],
          dateFields: ["created_at"],
        })
      )
      const record = result.data[0] as Record<string, unknown>
      expect(record.created_at).toBe(1_000_000)
    })
  })

  // ── Sentinel validation: the Fabric-specific behavior (accepts 1) ──────────

  describe("sentinel validation", () => {
    it("accepts integer 1 as a real data row (T-SQL)", () => {
      const result = fabricResponseNormalizer.normalize(
        input({ response: [row({ id: 1 }, 1, 1)] })
      )
      expect(result.data).toStrictEqual([{ id: 1 }])
    })

    it("accepts boolean true as a real data row", () => {
      const result = fabricResponseNormalizer.normalize(
        input({ response: [row({ id: 1 }, 1, true)] })
      )
      expect(result.data).toStrictEqual([{ id: 1 }])
    })

    it("rejects 0", () => {
      expect(() =>
        fabricResponseNormalizer.normalize(
          input({ response: [row({ id: 1 }, 1, 0)] })
        )
      ).toThrow(/__lakeql_record_present/u)
    })

    it("rejects false", () => {
      expect(() =>
        fabricResponseNormalizer.normalize(
          input({ response: [row({ id: 1 }, 1, false)] })
        )
      ).toThrow(/__lakeql_record_present/u)
    })

    it('rejects the string "1"', () => {
      expect(() =>
        fabricResponseNormalizer.normalize(
          input({ response: [row({ id: 1 }, 1, "1")] })
        )
      ).toThrow(/__lakeql_record_present/u)
    })

    it('rejects the string "true"', () => {
      expect(() =>
        fabricResponseNormalizer.normalize(
          input({ response: [row({ id: 1 }, 1, "true")] })
        )
      ).toThrow(/__lakeql_record_present/u)
    })

    it("rejects undefined", () => {
      expect(() =>
        fabricResponseNormalizer.normalize(
          input({
            response: [{ total_records: 1, id: 1 }],
          })
        )
      ).toThrow(/__lakeql_record_present/u)
    })
  })

  // ── Row shape validation ───────────────────────────────────────────────────

  describe("row shape validation", () => {
    it("rejects a non-object row", () => {
      expect(() =>
        fabricResponseNormalizer.normalize(
          input({ response: [row({ id: 1 }), "not-an-object"] })
        )
      ).toThrow(/plain object/u)
    })
  })
})
