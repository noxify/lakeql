// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable import/no-named-as-default-member
// Feature: custom-endpoint-cli, Property 7: Serialization round-trip produces byte-identical output

import fc from "fast-check"
import { describe, it, expect } from "vitest"

import { endpointDefinitionSchema } from "../../src/pipeline/schema"
import type {
  FieldDefinition,
  EndpointDefinitionFormat,
} from "../../src/pipeline/schema"
import { serializeDeterministic } from "../../src/pipeline/serialize"

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

/** Remove duplicate field names at the same level by keeping only the first occurrence */
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

/**
 * Generate a valid FieldDefinition[] with controlled nesting depth.
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

/** Generate a valid EndpointDefinitionFormat with controlled nesting */
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

describe("Property 7: Serialization round-trip produces byte-identical output", () => {
  it("serialize → parse → re-serialize produces identical output", () => {
    fc.assert(
      fc.property(validDefinitionArb(5), (definition) => {
        // Verify the definition is valid
        const parseResult = endpointDefinitionSchema.safeParse(definition)
        expect(parseResult.success).toBeTruthy()

        // First serialization
        const first = serializeDeterministic(definition)

        // Parse back from JSON
        const reparsed = JSON.parse(first)

        // Second serialization
        const second = serializeDeterministic(reparsed)

        // Must be byte-identical
        expect(first).toBe(second)
      }),
      { numRuns: 100 }
    )
  })

  it("round-trip preserves all field values correctly", () => {
    fc.assert(
      fc.property(validDefinitionArb(3), (definition) => {
        const parseResult = endpointDefinitionSchema.safeParse(definition)
        expect(parseResult.success).toBeTruthy()

        const serialized = serializeDeterministic(definition)
        const reparsed = JSON.parse(serialized)

        // The reparsed object should validate against the schema
        const reparseResult = endpointDefinitionSchema.safeParse(reparsed)
        expect(reparseResult.success).toBeTruthy()

        // And re-serializing produces identical output
        const reserialized = serializeDeterministic(reparsed)
        expect(reserialized).toBe(serialized)
      }),
      { numRuns: 100 }
    )
  })

  it("multiple round-trips remain stable (idempotent beyond first)", () => {
    fc.assert(
      fc.property(validDefinitionArb(4), (definition) => {
        const parseResult = endpointDefinitionSchema.safeParse(definition)
        expect(parseResult.success).toBeTruthy()

        const first = serializeDeterministic(definition)
        const second = serializeDeterministic(JSON.parse(first))
        const third = serializeDeterministic(JSON.parse(second))

        // All subsequent serializations must be identical to the first
        expect(second).toBe(first)
        expect(third).toBe(first)
      }),
      { numRuns: 100 }
    )
  })
})
