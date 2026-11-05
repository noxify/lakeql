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
})
