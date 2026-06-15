// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable import/no-named-as-default-member
// Feature: custom-endpoint-cli, Property 8: Deterministic serialization format invariants

import fc from "fast-check"
import { describe, it, expect } from "vitest"

import type {
  FieldDefinition,
  EndpointDefinitionFormat,
} from "../../src/pipeline/schema"
import { serializeDeterministic } from "../../src/pipeline/serialize"

// --- Helpers ---

/**
 * Recursively verify that all object keys are in sorted (lexicographic) order
 * at every nesting level.
 */
function allKeysSorted(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return true
  }

  if (Array.isArray(value)) {
    return value.every(allKeysSorted)
  }

  const keys = Object.keys(value as Record<string, unknown>)
  const sorted = [...keys].toSorted()

  for (let i = 0; i < keys.length; i += 1) {
    if (keys[i] !== sorted[i]) {
      return false
    }
  }

  // Recurse into child values
  return Object.values(value as Record<string, unknown>).every(allKeysSorted)
}

// --- Arbitraries ---

const primitiveTypes = [
  "String",
  "Integer",
  "Float",
  "Boolean",
  "Date",
  "DateTime",
] as const

/** Generate a valid field name matching /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/ */
const fieldNameArb = fc
  .tuple(
    fc.string({
      unit: fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"
      ),
      minLength: 1,
      maxLength: 1,
    }),
    fc.string({
      unit: fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"
      ),
      minLength: 0,
      maxLength: 10,
    })
  )
  .map(([first, rest]: [string, string]) => first + rest)

/** Generate a valid metadata field matching /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/ */
const metadataFieldArb = fc
  .tuple(
    fc.string({
      unit: fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"
      ),
      minLength: 1,
      maxLength: 1,
    }),
    fc.string({
      unit: fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"
      ),
      minLength: 0,
      maxLength: 15,
    })
  )
  .map(([first, rest]: [string, string]) => first + rest)

/**
 * Generate valid FieldDefinition[] with controlled nesting depth.
 */
function fieldDefinitionsArb(
  maxRemainingDepth: number
): fc.Arbitrary<FieldDefinition[]> {
  const primitiveFieldArb: fc.Arbitrary<FieldDefinition> = fc
    .tuple(fieldNameArb, fc.constantFrom(...primitiveTypes))
    .map(([name, type]: [string, (typeof primitiveTypes)[number]]) => ({
      name,
      type,
    }))

  if (maxRemainingDepth <= 1) {
    return fc
      .array(primitiveFieldArb, { minLength: 1, maxLength: 4 })
      .map(deduplicateFields)
  }

  const objectFieldArb: fc.Arbitrary<FieldDefinition> = fc
    .tuple(fieldNameArb, fieldDefinitionsArb(maxRemainingDepth - 1))
    .map(([name, fields]: [string, FieldDefinition[]]) => ({
      name,
      type: "Object" as const,
      fields,
    }))

  const arrayPrimitiveFieldArb: fc.Arbitrary<FieldDefinition> = fc
    .tuple(fieldNameArb, fc.constantFrom(...primitiveTypes))
    .map(([name, itemType]: [string, (typeof primitiveTypes)[number]]) => ({
      name,
      type: "Array" as const,
      items: { type: itemType },
    }))

  const arrayObjectFieldArb: fc.Arbitrary<FieldDefinition> = fc
    .tuple(fieldNameArb, fieldDefinitionsArb(maxRemainingDepth - 1))
    .map(([name, fields]: [string, FieldDefinition[]]) => ({
      name,
      type: "Array" as const,
      items: { type: "Object" as const, fields },
    }))

  const anyFieldArb = fc.oneof(
    { weight: 4, arbitrary: primitiveFieldArb },
    { weight: 2, arbitrary: objectFieldArb },
    { weight: 1, arbitrary: arrayPrimitiveFieldArb },
    { weight: 1, arbitrary: arrayObjectFieldArb }
  )

  return fc
    .array(anyFieldArb, { minLength: 1, maxLength: 5 })
    .map(deduplicateFields)
}

/** Remove duplicate field names at the same level */
function deduplicateFields(fields: FieldDefinition[]): FieldDefinition[] {
  const seen = new Set<string>()
  const result: FieldDefinition[] = []
  for (const field of fields) {
    if (!seen.has(field.name)) {
      seen.add(field.name)
      result.push(field)
    }
  }
  if (result.length === 0 && fields.length > 0) {
    return [fields[0]!]
  }
  return result
}

/** Generate a valid EndpointDefinitionFormat */
function validDefinitionArb(
  maxDepth = 5
): fc.Arbitrary<EndpointDefinitionFormat> {
  return fc
    .tuple(
      metadataFieldArb,
      metadataFieldArb,
      metadataFieldArb,
      fieldDefinitionsArb(maxDepth)
    )
    .map(
      ([tableName, catalog, schema, fields]: [
        string,
        string,
        string,
        FieldDefinition[],
      ]) => ({
        version: "1.0" as const,
        tableName,
        catalog,
        schema,
        fields,
      })
    )
}

// --- Tests ---

describe("Property 8: Deterministic serialization format invariants", () => {
  it("serialized output uses LF line endings exclusively (no CRLF)", () => {
    fc.assert(
      fc.property(validDefinitionArb(4), (definition) => {
        const output = serializeDeterministic(definition)

        // No \r\n present
        expect(output).not.toContain("\r\n")
        // Also no standalone \r
        expect(output).not.toContain("\r")
      }),
      { numRuns: 100 }
    )
  })

  it("serialized output ends with exactly one trailing newline", () => {
    fc.assert(
      fc.property(validDefinitionArb(4), (definition) => {
        const output = serializeDeterministic(definition)

        // Ends with \n
        expect(output.endsWith("\n")).toBeTruthy()
        // Does NOT end with \n\n (exactly one trailing newline)
        expect(output.endsWith("\n\n")).toBeFalsy()
      }),
      { numRuns: 100 }
    )
  })

  it("all object keys at every nesting level are sorted lexicographically", () => {
    fc.assert(
      fc.property(validDefinitionArb(4), (definition) => {
        const output = serializeDeterministic(definition)
        const parsed = JSON.parse(output)

        // JSON.parse preserves insertion order, so if the serializer
        // sorts keys, the parsed object's keys will be in sorted order.
        expect(allKeysSorted(parsed)).toBeTruthy()
      }),
      { numRuns: 100 }
    )
  })

  it("serialized output uses 2-space indentation", () => {
    fc.assert(
      fc.property(validDefinitionArb(4), (definition) => {
        const output = serializeDeterministic(definition)
        const lines = output.split("\n")

        for (const line of lines) {
          if (line.length === 0) {
            continue
          } // skip empty trailing line

          // Extract leading whitespace
          const match = line.match(/^(?<space>\s*)/u)
          const indent = match?.groups?.space ?? ""

          // Indentation should be a multiple of 2 spaces (no tabs)
          expect(indent).not.toContain("\t")
          expect(indent.length % 2).toBe(0)
        }
      }),
      { numRuns: 100 }
    )
  })

  it("all format invariants hold together for complex nested definitions", () => {
    fc.assert(
      fc.property(validDefinitionArb(5), (definition) => {
        const output = serializeDeterministic(definition)

        // 1. LF only
        expect(output).not.toContain("\r")

        // 2. Exactly one trailing newline
        expect(output.endsWith("\n")).toBeTruthy()
        expect(output.endsWith("\n\n")).toBeFalsy()

        // 3. All keys sorted
        const parsed = JSON.parse(output)
        expect(allKeysSorted(parsed)).toBeTruthy()

        // 4. 2-space indentation
        const lines = output.split("\n")
        for (const line of lines) {
          if (line.length === 0) {
            continue
          }
          const match = line.match(/^(?<space>\s*)/u)
          const indent = match?.groups?.space ?? ""
          expect(indent).not.toContain("\t")
          expect(indent.length % 2).toBe(0)
        }
      }),
      { numRuns: 100 }
    )
  })
})
