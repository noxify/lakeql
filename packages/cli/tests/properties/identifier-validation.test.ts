// oxlint-disable unicorn/no-useless-spread
// Feature: custom-endpoint-cli, Property 1: Identifier validation accepts and rejects correctly

import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { fieldNamePattern, metadataFieldPattern } from "@/pipeline/schema"

describe("Property 1: Identifier validation accepts and rejects correctly", () => {
  // Reference patterns for oracle comparison
  const fieldNameOracle = /^[a-zA-Z_][a-zA-Z0-9_]*$/u
  const MAX_FIELD_NAME_LENGTH = 64
  const MAX_METADATA_FIELD_LENGTH = 128

  // Generator for valid identifier characters
  const validFirstChar = fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"
  )
  const validSubsequentChar = fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"
  )

  // Generator for valid field names (1-64 chars)
  const validFieldName = fc
    .tuple(
      validFirstChar,
      fc.array(validSubsequentChar, { minLength: 0, maxLength: 63 })
    )
    .map(([first, rest]) => first + rest.join(""))

  // Generator for valid metadata field names (1-128 chars)
  const validMetadataField = fc
    .tuple(
      validFirstChar,
      fc.array(validSubsequentChar, { minLength: 0, maxLength: 127 })
    )
    .map(([first, rest]) => first + rest.join(""))

  describe("fieldNamePattern (max 64 chars)", () => {
    it("accepts any string matching ^[a-zA-Z_][a-zA-Z0-9_]*$ with length 1-64", () => {
      fc.assert(
        fc.property(validFieldName, (name) => {
          expect(fieldNamePattern.test(name)).toBeTruthy()
        }),
        { numRuns: 100 }
      )
    })

    it("rejects any arbitrary string that does not match the identifier pattern or exceeds max length", () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          const shouldAccept =
            fieldNameOracle.test(s) && s.length <= MAX_FIELD_NAME_LENGTH
          expect(fieldNamePattern.test(s)).toBe(shouldAccept)
        }),
        { numRuns: 100 }
      )
    })

    it("rejects strings starting with a digit", () => {
      const leadingDigitString = fc
        .tuple(
          fc.constantFrom(..."0123456789"),
          fc.array(validSubsequentChar, { minLength: 0, maxLength: 62 })
        )
        .map(([first, rest]) => first + rest.join(""))

      fc.assert(
        fc.property(leadingDigitString, (s) => {
          expect(fieldNamePattern.test(s)).toBeFalsy()
        }),
        { numRuns: 100 }
      )
    })

    it("accepts underscore as the first character", () => {
      const underscoreFirst = fc
        .array(validSubsequentChar, { minLength: 0, maxLength: 63 })
        .map((rest) => `_${rest.join("")}`)

      fc.assert(
        fc.property(underscoreFirst, (s) => {
          expect(fieldNamePattern.test(s)).toBeTruthy()
        }),
        { numRuns: 100 }
      )
    })

    it("rejects field names longer than 64 characters", () => {
      const tooLongFieldName = fc
        .tuple(
          validFirstChar,
          fc.array(validSubsequentChar, { minLength: 64, maxLength: 200 })
        )
        .map(([first, rest]) => first + rest.join(""))

      fc.assert(
        fc.property(tooLongFieldName, (name) => {
          expect(fieldNamePattern.test(name)).toBeFalsy()
        }),
        { numRuns: 100 }
      )
    })

    it("accepts field names exactly 64 characters long", () => {
      const exactly64 = fc
        .tuple(
          validFirstChar,
          fc.array(validSubsequentChar, { minLength: 63, maxLength: 63 })
        )
        .map(([first, rest]) => first + rest.join(""))

      fc.assert(
        fc.property(exactly64, (name) => {
          expect(name).toHaveLength(64)
          expect(fieldNamePattern.test(name)).toBeTruthy()
        }),
        { numRuns: 100 }
      )
    })
  })

  describe("metadataFieldPattern (max 128 chars)", () => {
    it("accepts any string matching ^[a-zA-Z_][a-zA-Z0-9_]*$ with length 1-128", () => {
      fc.assert(
        fc.property(validMetadataField, (name) => {
          expect(metadataFieldPattern.test(name)).toBeTruthy()
        }),
        { numRuns: 100 }
      )
    })

    it("rejects any arbitrary string that does not match the identifier pattern or exceeds max length", () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          const shouldAccept =
            fieldNameOracle.test(s) && s.length <= MAX_METADATA_FIELD_LENGTH
          expect(metadataFieldPattern.test(s)).toBe(shouldAccept)
        }),
        { numRuns: 100 }
      )
    })

    it("rejects strings starting with a digit", () => {
      const leadingDigitString = fc
        .tuple(
          fc.constantFrom(..."0123456789"),
          fc.array(validSubsequentChar, { minLength: 0, maxLength: 126 })
        )
        .map(([first, rest]) => first + rest.join(""))

      fc.assert(
        fc.property(leadingDigitString, (s) => {
          expect(metadataFieldPattern.test(s)).toBeFalsy()
        }),
        { numRuns: 100 }
      )
    })

    it("accepts underscore as the first character", () => {
      const underscoreFirst = fc
        .array(validSubsequentChar, { minLength: 0, maxLength: 127 })
        .map((rest) => `_${rest.join("")}`)

      fc.assert(
        fc.property(underscoreFirst, (s) => {
          expect(metadataFieldPattern.test(s)).toBeTruthy()
        }),
        { numRuns: 100 }
      )
    })

    it("rejects metadata fields longer than 128 characters", () => {
      const tooLongMetadata = fc
        .tuple(
          validFirstChar,
          fc.array(validSubsequentChar, { minLength: 128, maxLength: 300 })
        )
        .map(([first, rest]) => first + rest.join(""))

      fc.assert(
        fc.property(tooLongMetadata, (name) => {
          expect(metadataFieldPattern.test(name)).toBeFalsy()
        }),
        { numRuns: 100 }
      )
    })

    it("accepts metadata fields exactly 128 characters long", () => {
      const exactly128 = fc
        .tuple(
          validFirstChar,
          fc.array(validSubsequentChar, { minLength: 127, maxLength: 127 })
        )
        .map(([first, rest]) => first + rest.join(""))

      fc.assert(
        fc.property(exactly128, (name) => {
          expect(name).toHaveLength(128)
          expect(metadataFieldPattern.test(name)).toBeTruthy()
        }),
        { numRuns: 100 }
      )
    })
  })
})
