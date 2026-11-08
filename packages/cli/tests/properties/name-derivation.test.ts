// oxlint-disable eslint/no-template-curly-in-string

import { toCamelCase, toUpperFirst } from "@lakeql/helpers/string-case"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { deriveNames } from "@/pipeline/derive-names"

describe("Name derivation produces correct transformations", () => {
  // Generator for valid identifier strings matching metadataFieldPattern
  // /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/
  const validFirstChar = fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"
  )
  const validSubsequentChar = fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"
  )

  const validMetadataField = fc
    .tuple(
      validFirstChar,
      fc.array(validSubsequentChar, { minLength: 0, maxLength: 127 })
    )
    .map(([first, rest]) => first + rest.join(""))

  it("baseClassName equals ${toUpperFirst(toCamelCase(schema))}_${toUpperFirst(toCamelCase(tableName))}", () => {
    fc.assert(
      fc.property(
        validMetadataField,
        validMetadataField,
        (schema, tableName) => {
          const result = deriveNames(schema, tableName)
          const expected = `${toUpperFirst(toCamelCase(schema))}_${toUpperFirst(toCamelCase(tableName))}`
          expect(result.baseClassName).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("queryName equals ${toCamelCase(schema)}${toUpperFirst(toCamelCase(tableName))}", () => {
    fc.assert(
      fc.property(
        validMetadataField,
        validMetadataField,
        (schema, tableName) => {
          const result = deriveNames(schema, tableName)
          const expected = `${toCamelCase(schema)}${toUpperFirst(toCamelCase(tableName))}`
          expect(result.queryName).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("mutationName equals create${toCamelCase(schema)}${toUpperFirst(toCamelCase(tableName))}", () => {
    fc.assert(
      fc.property(
        validMetadataField,
        validMetadataField,
        (schema, tableName) => {
          const result = deriveNames(schema, tableName)
          const expected = `create${toCamelCase(schema)}${toUpperFirst(toCamelCase(tableName))}`
          expect(result.mutationName).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })
})
