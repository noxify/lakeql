import { describe, expect, it } from "vitest"

import { deriveNames } from "@/pipeline/derive-names"

const SCHEMA = "tier1_open_lake"
const TABLE = "itaps_v2_itaps_latest"

describe("deriveNames name prefixing", () => {
  describe("without a prefix (backward compatibility)", () => {
    it("produces the current R3 worked-example names", () => {
      const result = deriveNames(SCHEMA, TABLE)

      // The current (unset) mutation name joins `create` with the lower-cased
      // schema segment, so the seam stays lowercase (`createtier1…`). Captured
      // verbatim to lock in R6 byte-for-byte backward compatibility.
      expect(result).toStrictEqual({
        baseClassName: "Tier1OpenLake_ItapsV2ItapsLatest",
        queryName: "tier1OpenLakeItapsV2ItapsLatest",
        mutationName: "createtier1OpenLakeItapsV2ItapsLatest",
      })
    })

    it("is identical whether namePrefix is omitted or undefined", () => {
      expect(deriveNames(SCHEMA, TABLE, undefined)).toStrictEqual(
        deriveNames(SCHEMA, TABLE)
      )
    })
  })

  describe("with a prefix", () => {
    it("prepends the R3 worked-example prefix per target context", () => {
      const result = deriveNames(SCHEMA, TABLE, "trino")

      expect(result).toStrictEqual({
        baseClassName: "Trino_Tier1OpenLake_ItapsV2ItapsLatest",
        queryName: "trinoTier1OpenLakeItapsV2ItapsLatest",
        mutationName: "createTrinoTier1OpenLakeItapsV2ItapsLatest",
      })
    })

    it("normalizes mixed-case prefixes identically", () => {
      const lower = deriveNames(SCHEMA, TABLE, "trino")
      const upper = deriveNames(SCHEMA, TABLE, "Trino")
      const screaming = deriveNames(SCHEMA, TABLE, "TRINO")

      expect(upper).toStrictEqual(lower)
      expect(screaming).toStrictEqual(lower)
    })
  })

  describe("empty / whitespace prefix is treated as unset", () => {
    it.each(["", "   ", "\t\n"])("treats %j as no prefix", (prefix) => {
      expect(deriveNames(SCHEMA, TABLE, prefix)).toStrictEqual(
        deriveNames(SCHEMA, TABLE)
      )
    })

    it("trims surrounding whitespace before prefixing", () => {
      expect(deriveNames(SCHEMA, TABLE, "  trino  ")).toStrictEqual(
        deriveNames(SCHEMA, TABLE, "trino")
      )
    })
  })

  describe("invalid prefix fails fast", () => {
    // Each of these camel-cases to something that is not a valid GraphQL name:
    // "---"/"_"/"!!!" -> "" (empty), "1x"/"123" -> digit-leading, the non-ASCII
    // cases retain letters camelCase cannot fold to ASCII ("a日", "Ωmega" ->
    // "ωmega", "日本a"), and "x_€" camel-cases to "x€" (lodash/compat keep the
    // symbol as a word char), which the GraphQL name grammar rejects. The check
    // runs the same toCamelCase (es-toolkit/compat camelCase, lodash-identical)
    // that deriveNames uses, so it cannot drift from the generated names.
    it.each(["---", "_", "!!!", "1x", "123", "a日", "Ωmega", "日本a", "x_€"])(
      "throws for namePrefix %j",
      (prefix) => {
        expect(() => deriveNames(SCHEMA, TABLE, prefix)).toThrow(
          /invalid namePrefix/iu
        )
      }
    )

    it("names the data source and the offending prefix in the error", () => {
      expect(() => deriveNames(SCHEMA, TABLE, "1x", "trino_source")).toThrow(
        /"trino_source".*"1x"|"1x".*"trino_source"/iu
      )
    })
  })

  describe("deburrable prefix is accepted", () => {
    // toCamelCase folds Latin diacritics and ligatures to ASCII, so these
    // normalize to valid GraphQL names and must be accepted.
    it.each([
      ["é1", "e1"],
      ["über", "uber"],
      ["café", "cafe"],
    ])("accepts %j (camelCases to %j)", (prefix) => {
      expect(() => deriveNames(SCHEMA, TABLE, prefix)).not.toThrow()
    })

    it("prefixes names from a deburrable prefix", () => {
      const result = deriveNames(SCHEMA, TABLE, "über")

      expect(result.baseClassName).toBe("Uber_Tier1OpenLake_ItapsV2ItapsLatest")
      expect(result.queryName).toBe("uberTier1OpenLakeItapsV2ItapsLatest")
    })
  })
})
