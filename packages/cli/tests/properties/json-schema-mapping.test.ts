// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable import/no-named-as-default-member
// Feature: custom-endpoint-cli, Property 5: Field definitions to JSON Schema mapping

import { generateJsonSchemaFromFields } from "@lakeql/schema-generator/json-schema"
import fc from "fast-check"
import { describe, it, expect } from "vitest"

import type { FieldDefinition } from "../../src/pipeline/schema"

// --- Expected mappings ---

const PRIMITIVE_TYPE_MAP: Record<string, { type: string; format?: string }> = {
  String: { type: "string" },
  Integer: { type: "integer" },
  Float: { type: "number" },
  Boolean: { type: "boolean" },
  Date: { type: "string", format: "date" },
  DateTime: { type: "string", format: "date-time" },
}

// --- Recursive verification ---

/**
 * Recursively verifies that a FieldDefinition[] maps correctly to JSON Schema properties.
 */
function verifyFieldMappings(
  fields: FieldDefinition[],
  properties: Record<string, unknown>
): void {
  for (const field of fields) {
    const prop = properties[field.name] as Record<string, unknown> | undefined
    expect(prop).toBeDefined()

    if (
      field.type === "String" ||
      field.type === "Integer" ||
      field.type === "Float" ||
      field.type === "Boolean" ||
      field.type === "Date" ||
      field.type === "DateTime"
    ) {
      // Primitive field mapping
      const expected = PRIMITIVE_TYPE_MAP[field.type]!
      expect(prop!.type).toBe(expected.type)
      if (expected.format) {
        expect(prop!.format).toBe(expected.format)
      } else {
        expect(prop!.format).toBeUndefined()
      }
    } else if (field.type === "Object") {
      // Object field mapping
      expect(prop!.type).toBe("object")
      expect(prop!.additionalProperties).toBeFalsy()
      expect(prop!.properties).toBeDefined()

      // Recursively verify children
      if (field.fields && field.fields.length > 0) {
        verifyFieldMappings(
          field.fields,
          prop!.properties as Record<string, unknown>
        )
      }
    } else if (field.type === "Array") {
      // Array field mapping
      expect(prop!.type).toBe("array")
      expect(prop!.items).toBeDefined()

      const items = prop!.items as Record<string, unknown>
      if (field.items) {
        if (field.items.type === "Object" && field.items.fields) {
          // Array of objects
          expect(items.type).toBe("object")
          expect(items.additionalProperties).toBeFalsy()
          expect(items.properties).toBeDefined()
          verifyFieldMappings(
            field.items.fields,
            items.properties as Record<string, unknown>
          )
        } else {
          // Array of primitives
          const expected = PRIMITIVE_TYPE_MAP[field.items.type]!
          expect(items.type).toBe(expected.type)
          if (expected.format) {
            expect(items.format).toBe(expected.format)
          } else {
            expect(items.format).toBeUndefined()
          }
        }
      }
    }
  }
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

// --- Tests ---

describe("Property 5: Field definitions to JSON Schema mapping", () => {
  it("root schema has $schema, type:'object', properties, and additionalProperties:false", () => {
    fc.assert(
      fc.property(fieldDefinitionsArb(4), (fields) => {
        const schema = generateJsonSchemaFromFields(fields)

        expect(schema.$schema).toBe("https://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.additionalProperties).toBeFalsy()
        expect(schema.properties).toBeDefined()
        expect(schema.properties).toBeTypeOf("object")
      }),
      { numRuns: 100 }
    )
  })

  it("each primitive field maps to the correct JSON Schema type and format", () => {
    fc.assert(
      fc.property(fieldDefinitionsArb(1), (fields) => {
        // Depth 1 generates only primitive fields
        const schema = generateJsonSchemaFromFields(fields)

        for (const field of fields) {
          const prop = schema.properties![field.name] as Record<string, unknown>
          expect(prop).toBeDefined()

          const expected = PRIMITIVE_TYPE_MAP[field.type]!
          expect(prop!.type).toBe(expected.type)
          if (expected.format) {
            expect(prop!.format).toBe(expected.format)
          } else {
            expect(prop!.format).toBeUndefined()
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it("Object fields map to {type:'object', properties:{...}, additionalProperties:false} with recursively mapped children", () => {
    // Generate fields that always include at least one Object field
    const objectFieldArb: fc.Arbitrary<FieldDefinition[]> = fc
      .tuple(fieldNameArb, fieldDefinitionsArb(2))
      .map(([name, children]: [string, FieldDefinition[]]) => [
        { name, type: "Object" as const, fields: children },
      ])

    fc.assert(
      fc.property(objectFieldArb, (fields) => {
        const schema = generateJsonSchemaFromFields(fields)

        for (const field of fields) {
          const prop = schema.properties![field.name] as Record<string, unknown>
          expect(prop).toBeDefined()
          expect(prop!.type).toBe("object")
          expect(prop!.additionalProperties).toBeFalsy()
          expect(prop!.properties).toBeDefined()

          // Recursively verify nested fields
          if (field.fields) {
            verifyFieldMappings(
              field.fields,
              prop!.properties as Record<string, unknown>
            )
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it("Array fields map to {type:'array', items:{...}} with correctly mapped element types", () => {
    // Generate fields that always include Array fields
    const arrayFieldsArb: fc.Arbitrary<FieldDefinition[]> = fc
      .tuple(
        fc
          .tuple(fieldNameArb, fc.constantFrom(...primitiveTypes))
          .map(
            ([name, itemType]: [string, (typeof primitiveTypes)[number]]) => ({
              name,
              type: "Array" as const,
              items: { type: itemType },
            })
          ),
        fc
          .tuple(fieldNameArb, fieldDefinitionsArb(2))
          .map(([name, children]: [string, FieldDefinition[]]) => ({
            name: `${name}_obj`,
            type: "Array" as const,
            items: { type: "Object" as const, fields: children },
          }))
      )
      .map(([primArray, objArray]: [FieldDefinition, FieldDefinition]) =>
        deduplicateFields([primArray, objArray])
      )

    fc.assert(
      fc.property(arrayFieldsArb, (fields) => {
        const schema = generateJsonSchemaFromFields(fields)

        for (const field of fields) {
          const prop = schema.properties![field.name] as Record<string, unknown>
          expect(prop).toBeDefined()
          expect(prop!.type).toBe("array")
          expect(prop!.items).toBeDefined()

          const items = prop!.items as Record<string, unknown>
          if (field.items!.type === "Object" && field.items!.fields) {
            expect(items.type).toBe("object")
            expect(items.additionalProperties).toBeFalsy()
            expect(items.properties).toBeDefined()
            verifyFieldMappings(
              field.items!.fields!,
              items.properties as Record<string, unknown>
            )
          } else {
            const expected = PRIMITIVE_TYPE_MAP[field.items!.type]!
            expect(items.type).toBe(expected.type)
            if (expected.format) {
              expect(items.format).toBe(expected.format)
            } else {
              expect(items.format).toBeUndefined()
            }
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it("full recursive verification: all field types at all nesting levels map correctly", () => {
    fc.assert(
      fc.property(fieldDefinitionsArb(4), (fields) => {
        const schema = generateJsonSchemaFromFields(fields)

        // Verify root structure
        expect(schema.$schema).toBe("https://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.additionalProperties).toBeFalsy()
        expect(schema.properties).toBeDefined()

        // Recursively verify all field mappings
        verifyFieldMappings(fields, schema.properties!)
      }),
      { numRuns: 100 }
    )
  })

  it("output properties has exactly one entry per input field (no extra, no missing)", () => {
    fc.assert(
      fc.property(fieldDefinitionsArb(3), (fields) => {
        const schema = generateJsonSchemaFromFields(fields)

        const propertyKeys = Object.keys(schema.properties!)
        const fieldNames = fields.map((f) => f.name)

        expect(propertyKeys.toSorted()).toStrictEqual(fieldNames.toSorted())
      }),
      { numRuns: 100 }
    )
  })
})
