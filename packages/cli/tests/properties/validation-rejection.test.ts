// oxlint-disable import/no-named-as-default-member
// Feature: custom-endpoint-cli, Property 9: Schema validation rejects invalid definitions

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { endpointDefinitionSchema } from "../../src/pipeline/schema"

/** Valid metadata string generator (for building partially-valid objects) */
const _validMetadataStr = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,15}$/u)

/** Valid field name generator */
const validFieldName = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,15}$/u)

/** Valid primitive type literal */
const validPrimitiveType = fc.constantFrom(
  "String",
  "Integer",
  "Float",
  "Boolean",
  "Date",
  "DateTime"
)

/** A valid primitive field definition */
const _validPrimitiveField = fc.record({
  name: validFieldName,
  type: validPrimitiveType,
})

/** Build a minimal valid definition for mutation purposes */
function buildValidBase() {
  return {
    version: "1.0" as const,
    tableName: "test_table",
    catalog: "test_catalog",
    schema: "test_schema",
    fields: [{ name: "id", type: "String" }],
  }
}

describe("Property 9: Schema validation rejects invalid definitions", () => {
  it("rejects definitions missing required fields", () => {
    const requiredFields = [
      "version",
      "tableName",
      "catalog",
      "schema",
      "fields",
    ] as const

    fc.assert(
      fc.property(fc.constantFrom(...requiredFields), (fieldToRemove) => {
        const def = { ...buildValidBase() }
        // oxlint-disable-next-line typescript/no-dynamic-delete
        delete (def as Record<string, unknown>)[fieldToRemove]

        const result = endpointDefinitionSchema.safeParse(def)
        expect(result.success).toBeFalsy()
      }),
      { numRuns: 100 }
    )
  })

  it("rejects definitions with wrong version string", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== "1.0"),
        (wrongVersion) => {
          const def = { ...buildValidBase(), version: wrongVersion }

          const result = endpointDefinitionSchema.safeParse(def)
          expect(result.success).toBeFalsy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("rejects definitions with invalid field names (leading digit)", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9][a-zA-Z0-9_]{0,10}$/u),
        (invalidName) => {
          const def = {
            ...buildValidBase(),
            fields: [{ name: invalidName, type: "String" }],
          }

          const result = endpointDefinitionSchema.safeParse(def)
          expect(result.success).toBeFalsy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("rejects definitions with invalid field names (special characters)", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]*[-!@#$%^&*()+.][a-zA-Z0-9]*$/u),
        (invalidName) => {
          const def = {
            ...buildValidBase(),
            fields: [{ name: invalidName, type: "String" }],
          }

          const result = endpointDefinitionSchema.safeParse(def)
          expect(result.success).toBeFalsy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("rejects definitions with field names exceeding 64 characters", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{64,80}$/u),
        (tooLongName) => {
          const def = {
            ...buildValidBase(),
            fields: [{ name: tooLongName, type: "String" }],
          }

          const result = endpointDefinitionSchema.safeParse(def)
          expect(result.success).toBeFalsy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("rejects definitions with invalid type discriminators", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1 })
          .filter(
            (s) =>
              ![
                "String",
                "Integer",
                "Float",
                "Boolean",
                "Date",
                "DateTime",
                "Object",
                "Array",
              ].includes(s)
          ),
        (invalidType) => {
          const def = {
            ...buildValidBase(),
            fields: [{ name: "test_field", type: invalidType }],
          }

          const result = endpointDefinitionSchema.safeParse(def)
          expect(result.success).toBeFalsy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("rejects Object fields with empty fields array", () => {
    fc.assert(
      fc.property(validFieldName, (name) => {
        const def = {
          ...buildValidBase(),
          fields: [{ name, type: "Object", fields: [] }],
        }

        const result = endpointDefinitionSchema.safeParse(def)
        expect(result.success).toBeFalsy()
      }),
      { numRuns: 100 }
    )
  })

  it("rejects definitions with wrong types for metadata fields", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("tableName", "catalog", "schema"),
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.array(fc.string()),
          fc.object()
        ),
        (field, wrongValue) => {
          const def = { ...buildValidBase(), [field]: wrongValue }

          const result = endpointDefinitionSchema.safeParse(def)
          expect(result.success).toBeFalsy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("rejects definitions with invalid metadata field patterns", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("tableName", "catalog", "schema"),
        fc.stringMatching(/^[0-9][a-zA-Z0-9_]{0,10}$/u),
        (field, invalidValue) => {
          const def = { ...buildValidBase(), [field]: invalidValue }

          const result = endpointDefinitionSchema.safeParse(def)
          expect(result.success).toBeFalsy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("rejects definitions where fields is not an array", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.object()
        ),
        (wrongFields) => {
          const def = { ...buildValidBase(), fields: wrongFields }

          const result = endpointDefinitionSchema.safeParse(def)
          expect(result.success).toBeFalsy()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("rejects Array fields with missing items property", () => {
    fc.assert(
      fc.property(validFieldName, (name) => {
        const def = {
          ...buildValidBase(),
          fields: [{ name, type: "Array" }],
        }

        const result = endpointDefinitionSchema.safeParse(def)
        expect(result.success).toBeFalsy()
      }),
      { numRuns: 100 }
    )
  })

  it("rejects Array fields with invalid items type", () => {
    fc.assert(
      fc.property(
        validFieldName,
        fc
          .string({ minLength: 1 })
          .filter(
            (s) =>
              ![
                "String",
                "Integer",
                "Float",
                "Boolean",
                "Date",
                "DateTime",
                "Object",
              ].includes(s)
          ),
        (name, invalidItemType) => {
          const def = {
            ...buildValidBase(),
            fields: [{ name, type: "Array", items: { type: invalidItemType } }],
          }

          const result = endpointDefinitionSchema.safeParse(def)
          expect(result.success).toBeFalsy()
        }
      ),
      { numRuns: 100 }
    )
  })
})
