import { describe, expect, it } from "vitest"

import { DataSourceValidationError } from "../../src/errors/index"
import { validatePaging } from "../../src/validation/paging"

describe("paging validation", () => {
  it("accepts valid paging values", () => {
    expect(() => validatePaging({ page: 1, perPage: 10 })).not.toThrow()
    expect(() => validatePaging({ page: 100, perPage: 1 })).not.toThrow()
    expect(() => validatePaging({ page: 1, perPage: 500 })).not.toThrow()
  })

  describe("page validation", () => {
    it("throws for page = 0", () => {
      expect(() => validatePaging({ page: 0, perPage: 10 })).toThrow(
        DataSourceValidationError
      )
    })

    it("throws for page = -1", () => {
      expect(() => validatePaging({ page: -1, perPage: 10 })).toThrow(
        DataSourceValidationError
      )
    })

    it("throws for page = 1.5 (non-integer)", () => {
      expect(() => validatePaging({ page: 1.5, perPage: 10 })).toThrow(
        DataSourceValidationError
      )
    })

    it("error identifies field as 'page'", () => {
      let caught: DataSourceValidationError | undefined
      try {
        validatePaging({ page: 0, perPage: 10 })
      } catch (error) {
        caught = error as DataSourceValidationError
      }
      expect(caught).toBeInstanceOf(DataSourceValidationError)
      expect(caught?.field).toBe("page")
      expect(caught?.value).toBe(0)
    })
  })

  describe("perPage validation", () => {
    it("throws for perPage = 0", () => {
      expect(() => validatePaging({ page: 1, perPage: 0 })).toThrow(
        DataSourceValidationError
      )
    })

    it("throws for perPage = -1", () => {
      expect(() => validatePaging({ page: 1, perPage: -1 })).toThrow(
        DataSourceValidationError
      )
    })

    it("error identifies field as 'perPage'", () => {
      let caught: DataSourceValidationError | undefined
      try {
        validatePaging({ page: 1, perPage: -1 })
      } catch (error) {
        caught = error as DataSourceValidationError
      }
      expect(caught).toBeInstanceOf(DataSourceValidationError)
      expect(caught?.field).toBe("perPage")
      expect(caught?.value).toBe(-1)
    })
  })

  describe("maxPerPage upper bound", () => {
    it("accepts perPage at the default limit (10000)", () => {
      expect(() => validatePaging({ page: 1, perPage: 10_000 })).not.toThrow()
    })

    it("throws when perPage exceeds the default limit", () => {
      expect(() => validatePaging({ page: 1, perPage: 10_001 })).toThrow(
        DataSourceValidationError
      )
    })

    it("respects a custom maxPerPage", () => {
      expect(() =>
        validatePaging({ page: 1, perPage: 50 }, { maxPerPage: 100 })
      ).not.toThrow()
      expect(() =>
        validatePaging({ page: 1, perPage: 101 }, { maxPerPage: 100 })
      ).toThrow(DataSourceValidationError)
    })

    it("error identifies field as 'perPage' when over the limit", () => {
      let caught: DataSourceValidationError | undefined
      try {
        validatePaging({ page: 1, perPage: 200 }, { maxPerPage: 100 })
      } catch (error) {
        caught = error as DataSourceValidationError
      }
      expect(caught?.field).toBe("perPage")
      expect(caught?.value).toBe(200)
    })
  })

  describe("sorting validation", () => {
    it("accepts an omitted sorting field", () => {
      expect(() => validatePaging({ page: 1, perPage: 10 })).not.toThrow()
    })

    it("accepts an array sorting field", () => {
      expect(() =>
        validatePaging({ page: 1, perPage: 10, sorting: [] })
      ).not.toThrow()
      expect(() =>
        validatePaging({
          page: 1,
          perPage: 10,
          sorting: [{ field: "id", direction: "asc" }],
        })
      ).not.toThrow()
    })

    it("throws when sorting is a non-array value", () => {
      let caught: DataSourceValidationError | undefined
      try {
        validatePaging({
          page: 1,
          perPage: 10,
          sorting: "id" as unknown as readonly unknown[],
        })
      } catch (error) {
        caught = error as DataSourceValidationError
      }
      expect(caught).toBeInstanceOf(DataSourceValidationError)
      expect(caught?.field).toBe("sorting")
    })
  })
})
