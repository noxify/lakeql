// oxlint-disable vitest/no-conditional-expect
// oxlint-disable vitest/max-expects

import { describe, expect, it } from "vitest"

import {
  resolvePaging,
  SYSTEM_DEFAULT_MAX_RECORDS_PER_PAGE,
  SYSTEM_DEFAULT_PER_PAGE,
} from "../src/define-config/resolve-paging"
import { DataSourceConfigError } from "../src/errors/data-source-config-error"

describe("resolvePaging precedence, validation, and invariant", () => {
  describe("precedence per field", () => {
    it("uses system defaults when no override is supplied", () => {
      const result = resolvePaging({
        sourceName: "sales",
        adapterName: "trino",
        perSource: {},
        globalDefaults: undefined,
      })

      expect(result).toStrictEqual({
        defaultPerPage: SYSTEM_DEFAULT_PER_PAGE,
        maxRecordsPerPage: SYSTEM_DEFAULT_MAX_RECORDS_PER_PAGE,
      })
    })

    it("uses global defaults over system defaults", () => {
      const result = resolvePaging({
        sourceName: "sales",
        adapterName: "trino",
        perSource: {},
        globalDefaults: { defaultPerPage: 25, maxRecordsPerPage: 500 },
      })

      expect(result).toStrictEqual({
        defaultPerPage: 25,
        maxRecordsPerPage: 500,
      })
    })

    it("uses per-source values over global and system defaults", () => {
      const result = resolvePaging({
        sourceName: "sales",
        adapterName: "trino",
        perSource: { defaultPerPage: 10, maxRecordsPerPage: 50 },
        globalDefaults: { defaultPerPage: 25, maxRecordsPerPage: 500 },
      })

      expect(result).toStrictEqual({
        defaultPerPage: 10,
        maxRecordsPerPage: 50,
      })
    })

    it("resolves each field independently across tiers", () => {
      const result = resolvePaging({
        sourceName: "sales",
        adapterName: "trino",
        perSource: { defaultPerPage: 10 },
        globalDefaults: { maxRecordsPerPage: 500 },
      })

      expect(result).toStrictEqual({
        defaultPerPage: 10,
        maxRecordsPerPage: 500,
      })
    })
  })

  describe("field validation", () => {
    it.each([
      ["non-integer", 1.5],
      ["zero", 0],
      ["negative", -1],
      ["NaN", Number.NaN],
      ["non-finite", Number.POSITIVE_INFINITY],
    ])("rejects a %s per-source defaultPerPage", (_label, value: number) => {
      expect(() =>
        resolvePaging({
          sourceName: "sales",
          adapterName: "trino",
          perSource: { defaultPerPage: value },
          globalDefaults: undefined,
        })
      ).toThrow(DataSourceConfigError)
    })

    it("rejects an invalid global maxRecordsPerPage naming source and field", () => {
      try {
        resolvePaging({
          sourceName: "sales",
          adapterName: "trino",
          perSource: {},
          globalDefaults: { maxRecordsPerPage: 0 },
        })
        expect.fail("Expected DataSourceConfigError")
      } catch (error) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const err = error as DataSourceConfigError
        expect(err.sourceName).toBe("sales")
        expect(err.message).toContain("sales")
        expect(err.message).toContain("maxRecordsPerPage")
      }
    })
  })

  describe("invariant: defaultPerPage <= maxRecordsPerPage", () => {
    it("throws with a RangeError cause when the resolved default exceeds the max", () => {
      try {
        // No defaultPerPage override: system default 100 > maxRecordsPerPage 50.
        resolvePaging({
          sourceName: "sales",
          adapterName: "trino",
          perSource: { maxRecordsPerPage: 50 },
          globalDefaults: undefined,
        })
        expect.fail("Expected DataSourceConfigError")
      } catch (error) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const err = error as DataSourceConfigError
        expect(err.sourceName).toBe("sales")
        expect(err.cause).toBeInstanceOf(RangeError)
        expect(err.message).toContain("sales")
        expect(err.message).toContain("100")
        expect(err.message).toContain("50")
      }
    })

    it("allows defaultPerPage equal to maxRecordsPerPage", () => {
      const result = resolvePaging({
        sourceName: "sales",
        adapterName: "trino",
        perSource: { defaultPerPage: 50, maxRecordsPerPage: 50 },
        globalDefaults: undefined,
      })

      expect(result).toStrictEqual({
        defaultPerPage: 50,
        maxRecordsPerPage: 50,
      })
    })
  })
})
