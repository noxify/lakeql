// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { JsonSchema } from "../src/converter"
import { jsonSchemaToParquetSchema } from "../src/converter"

// --- Type mapping reference ---

const PRIMITIVE_TYPE_MAP = {
  // oxlint-disable-next-line unicorn/text-encoding-identifier-case -- UTF8 is the Parquet converted_type constant
  string: { type: "BYTE_ARRAY", converted_type: "UTF8" },
  "string:date-time": { type: "INT64", converted_type: "TIMESTAMP_MILLIS" },
  integer: { type: "INT64", converted_type: undefined },
  number: { type: "DOUBLE", converted_type: undefined },
  boolean: { type: "BOOLEAN", converted_type: undefined },
} as const

type PrimitiveKind = keyof typeof PRIMITIVE_TYPE_MAP

// --- Arbitraries ---

/** Generate a valid field name */
const fieldNameArb = fc
  .tuple(
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"),
      minLength: 1,
      maxLength: 1,
    }),
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_"),
      minLength: 0,
      maxLength: 8,
    })
  )
  .map(([first, rest]) => first + rest)

/** Generate a unique array of field names */
function uniqueFieldNamesArb(min: number, max: number): fc.Arbitrary<string[]> {
  return fc.uniqueArray(fieldNameArb, { minLength: min, maxLength: max })
}

/** Generates one of the primitive kinds */
const primitiveKindArb: fc.Arbitrary<PrimitiveKind> = fc.constantFrom(
  "string",
  "string:date-time",
  "integer",
  "number",
  "boolean"
)

/** Build a JsonSchema field from a primitive kind */
function primitiveFieldSchema(kind: PrimitiveKind): JsonSchema {
  if (kind === "string:date-time") {
    return { type: "string", format: "date-time" }
  }
  return { type: kind }
}

/** Generate a flat object JSON Schema with primitive fields and a chosen required subset */
const flatPrimitiveSchemaArb: fc.Arbitrary<{
  schema: JsonSchema
  fields: { name: string; kind: PrimitiveKind }[]
}> = fc
  .tuple(
    uniqueFieldNamesArb(1, 6),
    fc.array(primitiveKindArb, { minLength: 1, maxLength: 6 })
  )
  .chain(([names, kinds]) => {
    const count = Math.min(names.length, kinds.length)
    const usedNames = names.slice(0, count)
    const usedKinds = kinds.slice(0, count)

    return fc.subarray(usedNames).map((requiredFields) => {
      const properties: Record<string, JsonSchema> = {}
      const fields: { name: string; kind: PrimitiveKind }[] = []

      for (let i = 0; i < count; i += 1) {
        const name = usedNames[i] as string
        const kind = usedKinds[i] as PrimitiveKind
        properties[name] = primitiveFieldSchema(kind)
        fields.push({ name, kind })
      }

      const schema: JsonSchema = {
        type: "object",
        properties,
        required: requiredFields.length > 0 ? requiredFields : undefined,
      }

      return { schema, fields }
    })
  })

/** Generate a JSON schema with varied required arrays to test repetition types */
const schemaWithRequiredArb: fc.Arbitrary<{
  schema: JsonSchema
  fieldRequired: Map<string, boolean>
}> = fc
  .tuple(
    uniqueFieldNamesArb(1, 6),
    fc.array(primitiveKindArb, { minLength: 1, maxLength: 6 })
  )
  .chain(([names, kinds]) => {
    const count = Math.min(names.length, kinds.length)
    const usedNames = names.slice(0, count)
    const usedKinds = kinds.slice(0, count)

    return fc.subarray(usedNames).map((requiredFields) => {
      const properties: Record<string, JsonSchema> = {}
      const fieldRequired = new Map<string, boolean>()

      for (let i = 0; i < count; i += 1) {
        const name = usedNames[i] as string
        const kind = usedKinds[i] as PrimitiveKind
        properties[name] = primitiveFieldSchema(kind)
        fieldRequired.set(name, requiredFields.includes(name))
      }

      const schema: JsonSchema = {
        type: "object",
        properties,
        required: requiredFields.length > 0 ? requiredFields : undefined,
      }

      return { schema, fieldRequired }
    })
  })

/** Generate schemas with nullable union types for repetition testing */
const schemaWithNullableArb: fc.Arbitrary<{
  schema: JsonSchema
  fieldOptionalFromNull: Map<string, boolean>
}> = fc
  .tuple(
    uniqueFieldNamesArb(1, 4),
    fc.array(primitiveKindArb, { minLength: 1, maxLength: 4 }),
    fc.array(fc.boolean(), { minLength: 1, maxLength: 4 })
  )
  .map(([names, kinds, nullables]) => {
    const count = Math.min(names.length, kinds.length, nullables.length)
    const properties: Record<string, JsonSchema> = {}
    const fieldOptionalFromNull = new Map<string, boolean>()
    const required: string[] = []

    for (let i = 0; i < count; i += 1) {
      const name = names[i] as string
      const kind = kinds[i] as PrimitiveKind
      const nullable = nullables[i] as boolean

      if (nullable) {
        const baseType = kind === "string:date-time" ? "string" : kind
        properties[name] = {
          type: [baseType, "null"],
          ...(kind === "string:date-time" ? { format: "date-time" } : {}),
        }
        fieldOptionalFromNull.set(name, true)
      } else {
        properties[name] = primitiveFieldSchema(kind)
        fieldOptionalFromNull.set(name, false)
        required.push(name)
      }
    }

    const schema: JsonSchema = {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    }

    return { schema, fieldOptionalFromNull }
  })

/** Generate a nested object schema (object fields containing primitives) */
function nestedObjectSchemaArb(): fc.Arbitrary<{
  schema: JsonSchema
  nestedFields: { name: string; childCount: number }[]
}> {
  // Use a single pool of unique names to avoid parent-child name collisions
  return uniqueFieldNamesArb(2, 12)
    .map((allNames) => {
      // Split names into parent and child pools
      const parentCount = Math.min(3, Math.floor(allNames.length / 2))
      const parentNames = allNames.slice(0, parentCount)
      const childPool = allNames.slice(parentCount)

      const properties: Record<string, JsonSchema> = {}
      const nestedFields: { name: string; childCount: number }[] = []

      let childIdx = 0
      for (const parentName of parentNames) {
        const childProperties: Record<string, JsonSchema> = {}
        const childCount = Math.min(4, Math.max(1, childPool.length - childIdx))
        const endIdx = Math.min(childIdx + childCount, childPool.length)

        for (let i = childIdx; i < endIdx; i += 1) {
          childProperties[childPool[i] as string] = { type: "string" }
        }

        const actualChildCount = endIdx - childIdx
        childIdx = endIdx

        if (actualChildCount > 0) {
          properties[parentName] = {
            type: "object",
            properties: childProperties,
          }
          nestedFields.push({
            name: parentName,
            childCount: actualChildCount,
          })
        }

        if (childIdx >= childPool.length) {
          break
        }
      }

      const schema: JsonSchema = {
        type: "object",
        properties,
      }

      return { schema, nestedFields }
    })
    .filter(({ nestedFields }) => nestedFields.length > 0)
}

/** Generate a schema with array fields */
function arraySchemaArb(): fc.Arbitrary<{
  schema: JsonSchema
  arrayFields: string[]
}> {
  return uniqueFieldNamesArb(1, 4).map((names) => {
    const properties: Record<string, JsonSchema> = {}
    const arrayFields: string[] = []

    for (const name of names) {
      properties[name] = {
        type: "array",
        items: { type: "string" },
      }
      arrayFields.push(name)
    }

    const schema: JsonSchema = {
      type: "object",
      properties,
    }

    return { schema, arrayFields }
  })
}

/** Count primitive (leaf) fields in a JsonSchema recursively */
function countPrimitiveFields(schema: JsonSchema): number {
  if (!schema.properties) {
    return 0
  }
  let count = 0

  for (const fieldSchema of Object.values(schema.properties)) {
    const type = Array.isArray(fieldSchema.type)
      ? (fieldSchema.type.find((t) => t !== "null") ?? fieldSchema.type[0])
      : fieldSchema.type

    if (type === "object") {
      count += countPrimitiveFields(fieldSchema)
    } else if (type === "array") {
      if (fieldSchema.items) {
        const itemType = Array.isArray(fieldSchema.items.type)
          ? (fieldSchema.items.type.find((t) => t !== "null") ??
            fieldSchema.items.type[0])
          : fieldSchema.items.type

        count +=
          itemType === "object" ? countPrimitiveFields(fieldSchema.items) : 1
      }
    } else {
      count += 1
    }
  }

  return count
}

/** Count leaf elements in a SchemaElement array (elements without num_children) */
function countLeafElements(elements: { num_children?: number }[]): number {
  return elements.filter((el) => el.num_children === undefined).length
}

/** Generate a JSON schema with varying nesting depth for leaf count testing */
function mixedNestingSchemaArb(): fc.Arbitrary<JsonSchema> {
  return fc
    .tuple(
      uniqueFieldNamesArb(1, 4),
      fc.array(
        fc.constantFrom("primitive", "object", "array") as fc.Arbitrary<
          "primitive" | "object" | "array"
        >,
        { minLength: 1, maxLength: 4 }
      )
    )
    .chain(([names, fieldTypes]) => {
      const count = Math.min(names.length, fieldTypes.length)
      const usedNames = names.slice(0, count)
      const usedTypes = fieldTypes.slice(0, count)

      return fc
        .tuple(
          ...usedTypes.map((ft) => {
            if (ft === "primitive") {
              return primitiveKindArb.map((kind) => ({
                fieldType: "primitive" as const,
                kind,
                childNames: [] as string[],
              }))
            }
            if (ft === "object") {
              return fc
                .tuple(uniqueFieldNamesArb(1, 3))
                .map(([childNames]) => ({
                  fieldType: "object" as const,
                  kind: "string" as PrimitiveKind,
                  childNames,
                }))
            }
            return primitiveKindArb.map((kind) => ({
              fieldType: "array" as const,
              kind,
              childNames: [] as string[],
            }))
          })
        )
        .map((fieldConfigs) => {
          const properties: Record<string, JsonSchema> = {}

          for (let i = 0; i < count; i += 1) {
            const name = usedNames[i] as string
            const config = fieldConfigs[i] as (typeof fieldConfigs)[number]

            if (config.fieldType === "primitive") {
              properties[name] = primitiveFieldSchema(config.kind)
            } else if (config.fieldType === "object") {
              const childProperties: Record<string, JsonSchema> = {}
              for (const childName of config.childNames) {
                childProperties[childName] = { type: "string" }
              }
              properties[name] = {
                type: "object",
                properties: childProperties,
              }
            } else {
              // array
              properties[name] = {
                type: "array",
                items: primitiveFieldSchema(config.kind),
              }
            }
          }

          return {
            type: "object",
            properties,
          } as JsonSchema
        })
    })
}

// --- Property Tests ---

describe("Property 1: Primitive Type Mapping Correctness", () => {
  it("maps primitive JSON Schema types to the correct Parquet type and converted_type", () => {
    fc.assert(
      fc.property(flatPrimitiveSchemaArb, ({ schema, fields }) => {
        const elements = jsonSchemaToParquetSchema(schema)
        // Skip the root element
        const fieldElements = elements.slice(1)

        for (const { name, kind } of fields) {
          const element = fieldElements.find((el) => el.name === name)
          expect(element).toBeDefined()

          const expected = PRIMITIVE_TYPE_MAP[kind]
          // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
          expect(element!.type).toBe(expected.type)
          // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
          expect(element!.converted_type).toBe(expected.converted_type)
        }
      }),
      { numRuns: 100 }
    )
  })
})

describe("Property 2: Repetition Type Correctness", () => {
  it("sets REQUIRED when field is in parent required array, OPTIONAL otherwise", () => {
    fc.assert(
      fc.property(schemaWithRequiredArb, ({ schema, fieldRequired }) => {
        const elements = jsonSchemaToParquetSchema(schema)
        const fieldElements = elements.slice(1)

        for (const [name, isRequired] of fieldRequired) {
          const element = fieldElements.find((el) => el.name === name)
          expect(element).toBeDefined()

          // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field
          if (isRequired) {
            // oxlint-disable-next-line typescript/no-non-null-assertion, vitest/no-conditional-expect -- asserted above
            expect(element!.repetition_type).toBe("REQUIRED")
          } else {
            // oxlint-disable-next-line typescript/no-non-null-assertion, vitest/no-conditional-expect -- asserted above
            expect(element!.repetition_type).toBe("OPTIONAL")
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it("sets OPTIONAL when field has a nullable union type even if in required array", () => {
    fc.assert(
      fc.property(
        schemaWithNullableArb,
        ({ schema, fieldOptionalFromNull }) => {
          const elements = jsonSchemaToParquetSchema(schema)
          const fieldElements = elements.slice(1)

          for (const [name, isNullable] of fieldOptionalFromNull) {
            const element = fieldElements.find((el) => el.name === name)
            expect(element).toBeDefined()

            // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field
            if (isNullable) {
              // oxlint-disable-next-line typescript/no-non-null-assertion, vitest/no-conditional-expect -- asserted above
              expect(element!.repetition_type).toBe("OPTIONAL")
            } else {
              // non-nullable and in required array → REQUIRED
              // oxlint-disable-next-line typescript/no-non-null-assertion, vitest/no-conditional-expect -- asserted above
              expect(element!.repetition_type).toBe("REQUIRED")
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe("Property 3: Structural Conversion Correctness", () => {
  it("produces group elements with correct num_children for nested objects", () => {
    fc.assert(
      fc.property(nestedObjectSchemaArb(), ({ schema, nestedFields }) => {
        const elements = jsonSchemaToParquetSchema(schema)

        for (const { name, childCount } of nestedFields) {
          const groupElement = elements.find((el) => el.name === name)
          expect(groupElement).toBeDefined()
          // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
          expect(groupElement!.num_children).toBe(childCount)
          // Group elements should not have a primitive type
          // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
          expect(groupElement!.type).toBeUndefined()
        }
      }),
      { numRuns: 100 }
    )
  })

  it("produces LIST structure with repeated group for array fields", () => {
    fc.assert(
      fc.property(arraySchemaArb(), ({ schema, arrayFields }) => {
        const elements = jsonSchemaToParquetSchema(schema)

        for (const fieldName of arrayFields) {
          const listRoot = elements.find((el) => el.name === fieldName)
          expect(listRoot).toBeDefined()
          // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
          expect(listRoot!.converted_type).toBe("LIST")
          // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
          expect(listRoot!.num_children).toBe(1)

          // Find the list node (immediately after listRoot)
          // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
          const listRootIndex = elements.indexOf(listRoot!)
          const listNode = elements[listRootIndex + 1]
          expect(listNode).toBeDefined()
          // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
          expect(listNode!.name).toBe("list")
          // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
          expect(listNode!.repetition_type).toBe("REPEATED")
          // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
          expect(listNode!.num_children).toBe(1)

          // Find the element child
          const elementNode = elements[listRootIndex + 2]
          expect(elementNode).toBeDefined()
          // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
          expect(elementNode!.name).toBe("element")
        }
      }),
      { numRuns: 100 }
    )
  })
})

describe("Property 4: Invalid Schema Error Signaling", () => {
  it("throws error for non-object top-level types", () => {
    const nonObjectTypeArb = fc.constantFrom(
      "string",
      "integer",
      "number",
      "boolean",
      "array"
    )

    fc.assert(
      fc.property(nonObjectTypeArb, (topType) => {
        const schema: JsonSchema = { type: topType }
        expect(() => jsonSchemaToParquetSchema(schema)).toThrow(
          "Top-level JSON schema must be of type 'object'"
        )
      }),
      { numRuns: 100 }
    )
  })

  it("throws error for fields with multi-type unions (more than one non-null)", () => {
    // Generate schemas where a field has 2+ non-null types
    const multiUnionSchemaArb = fc
      .tuple(
        fieldNameArb,
        fc.subarray(["string", "integer", "number", "boolean"], {
          minLength: 2,
          maxLength: 4,
        })
      )
      .map(([name, types]) => ({
        type: "object",
        properties: {
          [name]: { type: types },
        },
      })) as fc.Arbitrary<JsonSchema>

    fc.assert(
      fc.property(multiUnionSchemaArb, (schema) => {
        expect(() => jsonSchemaToParquetSchema(schema)).toThrow(
          "Unsupported JSON schema union"
        )
      }),
      { numRuns: 100 }
    )
  })
})

describe("Property 6: Schema Conversion Type Consistency", () => {
  it("same type fields in different schemas produce identical Parquet type mappings", () => {
    // Generate two different schemas that share the same field type/format
    const consistencyArb = fc
      .tuple(primitiveKindArb, fieldNameArb, fieldNameArb)
      .map(([kind, name1, name2]) => ({ kind, name1, name2 }))

    fc.assert(
      fc.property(consistencyArb, ({ kind, name1, name2 }) => {
        const schema1: JsonSchema = {
          type: "object",
          properties: { [name1]: primitiveFieldSchema(kind) },
        }
        const schema2: JsonSchema = {
          type: "object",
          properties: { [name2]: primitiveFieldSchema(kind) },
        }

        const elements1 = jsonSchemaToParquetSchema(schema1)
        const elements2 = jsonSchemaToParquetSchema(schema2)

        // Skip root, get field elements
        const field1 = elements1.find((el) => el.name === name1)
        const field2 = elements2.find((el) => el.name === name2)

        expect(field1).toBeDefined()
        expect(field2).toBeDefined()
        // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
        expect(field1!.type).toBe(field2!.type)
        // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
        expect(field1!.converted_type).toBe(field2!.converted_type)
      }),
      { numRuns: 100 }
    )
  })
})

describe("Property 7: Leaf Element Count Invariant", () => {
  it("leaf element count equals the number of primitive fields in the JSON Schema", () => {
    fc.assert(
      fc.property(mixedNestingSchemaArb(), (schema) => {
        const elements = jsonSchemaToParquetSchema(schema)
        const leafCount = countLeafElements(elements)
        const primitiveCount = countPrimitiveFields(schema)

        expect(leafCount).toBe(primitiveCount)
      }),
      { numRuns: 100 }
    )
  })

  it("leaf count invariant holds for flat primitive-only schemas", () => {
    fc.assert(
      fc.property(flatPrimitiveSchemaArb, ({ schema, fields }) => {
        const elements = jsonSchemaToParquetSchema(schema)
        const leafCount = countLeafElements(elements)

        expect(leafCount).toBe(fields.length)
      }),
      { numRuns: 100 }
    )
  })
})
