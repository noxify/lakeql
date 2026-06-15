// oxlint-disable eslint/no-template-curly-in-string
// Feature: custom-endpoint-cli, Property 2: Name derivation produces correct transformations

import * as fc from "fast-check"
import { camelCase, upperFirst } from "lodash-es"
import { describe, expect, it } from "vitest"

import { deriveNames } from "@/pipeline/derive-names"

describe("Property 2: Name derivation produces correct transformations", () => {
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

  it("baseClassName equals ${upperFirst(camelCase(schema))}_${upperFirst(camelCase(tableName))}", () => {
    fc.assert(
      fc.property(
        validMetadataField,
        validMetadataField,
        (schema, tableName) => {
          const result = deriveNames(schema, tableName)
          const expected = `${upperFirst(camelCase(schema))}_${upperFirst(camelCase(tableName))}`
          expect(result.baseClassName).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("queryName equals ${camelCase(schema)}${upperFirst(camelCase(tableName))}", () => {
    fc.assert(
      fc.property(
        validMetadataField,
        validMetadataField,
        (schema, tableName) => {
          const result = deriveNames(schema, tableName)
          const expected = `${camelCase(schema)}${upperFirst(camelCase(tableName))}`
          expect(result.queryName).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("mutationName equals create${camelCase(schema)}${upperFirst(camelCase(tableName))}", () => {
    fc.assert(
      fc.property(
        validMetadataField,
        validMetadataField,
        (schema, tableName) => {
          const result = deriveNames(schema, tableName)
          const expected = `create${camelCase(schema)}${upperFirst(camelCase(tableName))}`
          expect(result.mutationName).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })
})
