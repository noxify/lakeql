// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  endpointDefinitionSchema,
  fieldNamePattern,
  loadStrategies,
  metadataFieldPattern,
  primitiveTypes,
} from "../src/endpoint-schema"

// --- Arbitraries ---

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
  .map(([first, rest]) => first + rest)
  .filter((name) => fieldNamePattern.test(name))

/** Generate a valid metadata name matching /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/ */
const metadataNameArb = fc
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
  .map(([first, rest]) => first + rest)
  .filter((name) => metadataFieldPattern.test(name))

/** Generate a valid load strategy */
const loadStrategyArb = fc.constantFrom(...loadStrategies)

/** Generate a valid base path (non-empty string) */
const basePathArb = fc
  .tuple(
    fc.constantFrom("warehouse/", "data/", "s3/", "storage/"),
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_/-"),
      minLength: 1,
      maxLength: 20,
    })
  )
  .map(([prefix, rest]) => prefix + rest)

/** Generate a valid primitive field type */
const primitiveTypeArb = fc.constantFrom(...primitiveTypes)

/** Generate a field validation refinement */
const fieldValidationArb: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  fc.constant({ type: "email" }),
  fc.constant({ type: "url" }),
  fc.constant({ type: "uuid" }),
  fc.record({
    type: fc.constant("min"),
    value: fc.double({ min: -1000, max: 1000, noNaN: true }),
  }),
  fc.record({
    type: fc.constant("max"),
    value: fc.double({ min: -1000, max: 1000, noNaN: true }),
  }),
  fc.record({
    type: fc.constant("regex"),
    pattern: fc.constantFrom("^[a-z]+$", "\\d+", ".*@.*"),
  })
)

/** Generate optional field options */
const fieldOptionsArb: fc.Arbitrary<Record<string, unknown> | undefined> =
  fc.oneof(
    fc.constant(undefined as Record<string, unknown> | undefined),
    fc.record({
      required: fc.boolean(),
    }),
    fc.record({
      required: fc.boolean(),
      validations: fc.array(fieldValidationArb, { minLength: 0, maxLength: 3 }),
    }),
    fc.record({
      validations: fc.array(fieldValidationArb, { minLength: 1, maxLength: 2 }),
    })
  )

/** Generate a primitive field definition (no nesting) */
const primitiveFieldArb = fc
  .tuple(fieldNameArb, primitiveTypeArb, fieldOptionsArb)
  .map(([name, type, options]) => {
    const field: Record<string, unknown> = { name, type }
    if (options !== undefined) {
      field.options = options
    }
    return field
  })

/** Generate an Object field definition with nested primitive children */
const objectFieldArb = fc
  .tuple(
    fieldNameArb,
    fc.uniqueArray(
      fc
        .tuple(fieldNameArb, primitiveTypeArb)
        .map(([name, type]) => ({ name, type })),
      { minLength: 1, maxLength: 3, selector: (f) => f.name }
    )
  )
  .map(([name, childFields]) => ({
    name,
    type: "Object",
    fields: childFields,
  }))

/** Generate an Array field definition */
const arrayFieldArb = fc
  .tuple(
    fieldNameArb,
    fc.oneof(
      primitiveTypeArb.map((type) => ({ type })),
      fc.constant({ type: "Object", fields: [{ name: "id", type: "String" }] })
    )
  )
  .map(([name, items]) => ({
    name,
    type: "Array",
    items,
  }))

/** Generate a list of unique field definitions (mix of primitive, object, array) */
const fieldsArb = fc.uniqueArray(
  fc.oneof(
    { weight: 5, arbitrary: primitiveFieldArb },
    { weight: 2, arbitrary: objectFieldArb },
    { weight: 1, arbitrary: arrayFieldArb }
  ),
  { minLength: 1, maxLength: 6, selector: (f) => f.name as string }
)

/** Generate a valid bucket name (non-empty string) */
const bucketArb = fc
  .tuple(
    fc.constantFrom("my-", "data-", "lake-", "s3-"),
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-"),
      minLength: 1,
      maxLength: 20,
    })
  )
  .map(([prefix, rest]) => prefix + rest)

/** Generate mutation config: false, config object, or absent (undefined) */
const mutationArb: fc.Arbitrary<
  false | { loadStrategy: string; bucket: string; basePath: string } | undefined
> = fc.oneof(
  fc.constant(
    undefined as
      | false
      | { loadStrategy: string; bucket: string; basePath: string }
      | undefined
  ),
  fc.constant(false as const),
  fc.record({
    loadStrategy: loadStrategyArb,
    bucket: bucketArb,
    basePath: basePathArb,
  })
)

/** Generate a complete valid endpoint definition */
const endpointDefinitionArb = fc
  .tuple(
    metadataNameArb,
    metadataNameArb,
    metadataNameArb,
    fieldsArb,
    mutationArb
  )
  .map(([tableName, catalog, schema, fields, mutation]) => {
    const def: Record<string, unknown> = {
      version: "1.0",
      tableName,
      catalog,
      schema,
      fields,
    }
    if (mutation !== undefined) {
      def.mutation = mutation
    }
    return def
  })

// --- Property Tests ---

describe("Property 9: Extended Endpoint Definition Schema Validation", () => {
  it("parses valid endpoint definitions with mutation: false", () => {
    const endpointWithMutationFalseArb = fc
      .tuple(metadataNameArb, metadataNameArb, metadataNameArb, fieldsArb)
      .map(([tableName, catalog, schema, fields]) => ({
        version: "1.0",
        tableName,
        catalog,
        schema,
        fields,
        mutation: false,
      }))

    fc.assert(
      fc.property(endpointWithMutationFalseArb, (definition) => {
        const result = endpointDefinitionSchema.safeParse(definition)
        expect(result.success).toBeTruthy()
      }),
      { numRuns: 100 }
    )
  })

  it("parses valid endpoint definitions with mutation config object", () => {
    const endpointWithMutationConfigArb = fc
      .tuple(
        metadataNameArb,
        metadataNameArb,
        metadataNameArb,
        fieldsArb,
        loadStrategyArb,
        bucketArb,
        basePathArb
      )
      .map(
        ([
          tableName,
          catalog,
          schema,
          fields,
          loadStrategy,
          bucket,
          basePath,
        ]) => ({
          version: "1.0",
          tableName,
          catalog,
          schema,
          fields,
          mutation: { loadStrategy, bucket, basePath },
        })
      )

    fc.assert(
      fc.property(endpointWithMutationConfigArb, (definition) => {
        const result = endpointDefinitionSchema.safeParse(definition)
        expect(result.success).toBeTruthy()
      }),
      { numRuns: 100 }
    )
  })

  it("parses valid endpoint definitions without mutation field (absent)", () => {
    const endpointWithoutMutationArb = fc
      .tuple(metadataNameArb, metadataNameArb, metadataNameArb, fieldsArb)
      .map(([tableName, catalog, schema, fields]) => ({
        version: "1.0",
        tableName,
        catalog,
        schema,
        fields,
      }))

    fc.assert(
      fc.property(endpointWithoutMutationArb, (definition) => {
        const result = endpointDefinitionSchema.safeParse(definition)
        expect(result.success).toBeTruthy()
      }),
      { numRuns: 100 }
    )
  })

  it("parses valid field definitions with options (required and validations)", () => {
    const endpointWithFieldOptionsArb = fc
      .tuple(
        metadataNameArb,
        metadataNameArb,
        metadataNameArb,
        fc.uniqueArray(
          fc
            .tuple(
              fieldNameArb,
              primitiveTypeArb,
              fc.boolean(),
              fc.array(fieldValidationArb, { minLength: 0, maxLength: 3 })
            )
            .map(([name, type, required, validations]) => ({
              name,
              type,
              options: {
                required,
                ...(validations.length > 0 ? { validations } : {}),
              },
            })),
          { minLength: 1, maxLength: 5, selector: (f) => f.name }
        )
      )
      .map(([tableName, catalog, schema, fields]) => ({
        version: "1.0",
        tableName,
        catalog,
        schema,
        fields,
      }))

    fc.assert(
      fc.property(endpointWithFieldOptionsArb, (definition) => {
        const result = endpointDefinitionSchema.safeParse(definition)
        expect(result.success).toBeTruthy()
      }),
      { numRuns: 100 }
    )
  })

  it("parses all valid endpoint definitions (combined: mutation variants + field options)", () => {
    fc.assert(
      fc.property(endpointDefinitionArb, (definition) => {
        const result = endpointDefinitionSchema.safeParse(definition)
        expect(result.success).toBeTruthy()
      }),
      { numRuns: 100 }
    )
  })
})
