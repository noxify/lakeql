// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects

import type { FieldDefinition } from "@lakeql/schema-generator/endpoint-schema"
import fc from "fast-check"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { generateValidationsSchema } from "@/pipeline/validations-schema"

// --- Helpers ---

/**
 * Helper to print AST nodes to a string for assertion.
 */
function printNodes(nodes: ts.Node[]): string {
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    omitTrailingSemicolon: true,
  })
  const sourceFile = ts.createSourceFile(
    "test.ts",
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  )
  return nodes
    .map((node) => printer.printNode(ts.EmitHint.Unspecified, node, sourceFile))
    .join("\n\n")
}

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

/** Field types that the Zod generator handles with specific base types. */
const typesWithBaseZod = [
  "String",
  "Integer",
  "Float",
  "Boolean",
  "DateTime",
] as const
type ZodFieldType = (typeof typesWithBaseZod)[number]

const zodFieldTypeArb: fc.Arbitrary<ZodFieldType> = fc.constantFrom(
  ...typesWithBaseZod
)

/** Expected base Zod type string for each field type */
const expectedBaseType: Record<ZodFieldType, string> = {
  String: "z.string()",
  Integer: "z.number().int()",
  Float: "z.number()",
  Boolean: "z.boolean()",
  DateTime: "z.string().datetime()",
}

/** Generate a validation refinement appropriate for the field type */
const stringValidationArb = fc.oneof(
  fc.constant({ type: "email" as const }),
  fc.constant({ type: "url" as const }),
  fc.constant({ type: "uuid" as const }),
  fc.record({
    type: fc.constant("regex" as const),
    pattern: fc.constantFrom("^[a-z]+$", "\\d+", ".*@.*", "^\\w{3,10}$"),
  })
)

const numericValidationArb = fc.oneof(
  fc.record({
    type: fc.constant("min" as const),
    value: fc.integer({ min: 0, max: 1000 }),
  }),
  fc.record({
    type: fc.constant("max" as const),
    value: fc.integer({ min: 0, max: 1000 }),
  })
)

/** Generate validations appropriate for the given field type */
function validationsForType(fieldType: ZodFieldType) {
  switch (fieldType) {
    case "String":
    case "DateTime": {
      return fc.array(fc.oneof(stringValidationArb, numericValidationArb), {
        minLength: 1,
        maxLength: 3,
      })
    }
    case "Integer":
    case "Float": {
      return fc.array(numericValidationArb, { minLength: 1, maxLength: 3 })
    }
    case "Boolean": {
      // Boolean doesn't have meaningful validations but generator accepts any
      return fc.array(
        fc.oneof(
          fc.constant({ type: "email" as const }),
          fc.record({
            type: fc.constant("min" as const),
            value: fc.integer({ min: 0, max: 100 }),
          })
        ),
        { minLength: 1, maxLength: 2 }
      )
    }
    default: {
      return fc.array(numericValidationArb, { minLength: 1, maxLength: 2 })
    }
  }
}

/** Generate a single field definition with validations */
const fieldWithValidationsArb: fc.Arbitrary<{
  field: FieldDefinition
  fieldType: ZodFieldType
  required: boolean
  validations: NonNullable<
    NonNullable<FieldDefinition["options"]>["validations"]
  >
}> = zodFieldTypeArb.chain((fieldType) =>
  fc
    .tuple(fieldNameArb, fc.boolean(), validationsForType(fieldType))
    .map(([name, required, validations]) => ({
      field: {
        name,
        type: fieldType,
        options: { required, validations },
      } as FieldDefinition,
      fieldType,
      required,
      validations,
    }))
)

/** Generate multiple fields with unique names and validations */
const fieldsWithValidationsArb = fc.uniqueArray(fieldWithValidationsArb, {
  minLength: 1,
  maxLength: 5,
  selector: (item) => item.field.name,
})

// --- Property Tests ---

describe("Property 11: Zod Validation Schema Generation Correctness", () => {
  it("derives the correct base Zod type from the field type", () => {
    fc.assert(
      fc.property(fieldWithValidationsArb, ({ field, fieldType }) => {
        const result = generateValidationsSchema([field])
        expect(result).not.toBeNull()

        // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
        const output = printNodes(result!)
        const baseType = expectedBaseType[fieldType]

        // The output should contain the base type expression
        expect(output).toContain(baseType)
      }),
      { numRuns: 100 }
    )
  })

  it("chains validation refinements in order in the output", () => {
    fc.assert(
      fc.property(fieldWithValidationsArb, ({ field, validations }) => {
        const result = generateValidationsSchema([field])
        expect(result).not.toBeNull()

        // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
        const output = printNodes(result!)

        // Each validation should appear as a chained method call
        for (const validation of validations) {
          switch (validation.type) {
            case "email": {
              // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-validation
              expect(output).toContain(".email()")
              break
            }
            case "url": {
              // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-validation
              expect(output).toContain(".url()")
              break
            }
            case "uuid": {
              // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-validation
              expect(output).toContain(".uuid()")
              break
            }
            case "min": {
              // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-validation
              expect(output).toContain(`.min(${validation.value})`)
              break
            }
            case "max": {
              // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-validation
              expect(output).toContain(`.max(${validation.value})`)
              break
            }
            case "regex": {
              // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-validation
              expect(output).toContain(".regex(new RegExp(")
              // The pattern is stored as a string literal in the AST, so
              // backslashes are escaped in the printed output
              // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-validation
              expect(output).toContain(
                validation.pattern.replaceAll("\\", "\\\\")
              )
              break
            }
            default: {
              break
            }
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it("includes .nullable() when options.required is false", () => {
    const fieldNotRequiredArb: fc.Arbitrary<FieldDefinition> =
      zodFieldTypeArb.chain((fieldType) =>
        fc
          .tuple(fieldNameArb, validationsForType(fieldType))
          .map(([name, validations]) => ({
            name,
            type: fieldType,
            options: { required: false, validations },
          }))
      )

    fc.assert(
      fc.property(fieldNotRequiredArb, (field) => {
        const result = generateValidationsSchema([field])
        expect(result).not.toBeNull()

        // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
        const output = printNodes(result!)
        expect(output).toContain(".nullable()")
      }),
      { numRuns: 100 }
    )
  })

  it("does NOT include .nullable() when options.required is true", () => {
    const fieldRequiredArb: fc.Arbitrary<FieldDefinition> =
      zodFieldTypeArb.chain((fieldType) =>
        fc
          .tuple(fieldNameArb, validationsForType(fieldType))
          .map(([name, validations]) => ({
            name,
            type: fieldType,
            options: { required: true, validations },
          }))
      )

    fc.assert(
      fc.property(fieldRequiredArb, (field) => {
        const result = generateValidationsSchema([field])
        expect(result).not.toBeNull()

        // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
        const output = printNodes(result!)
        expect(output).not.toContain(".nullable()")
      }),
      { numRuns: 100 }
    )
  })

  it("generates correct schema for multiple fields with varied types and validations", () => {
    fc.assert(
      fc.property(fieldsWithValidationsArb, (items) => {
        const fields = items.map((item) => item.field)
        const result = generateValidationsSchema(fields)
        expect(result).not.toBeNull()

        // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
        const output = printNodes(result!)

        // Should contain z.object
        expect(output).toContain("z.object(")

        // Each field should be present with correct base type and nullable handling
        for (const { field, fieldType, required } of items) {
          const baseType = expectedBaseType[fieldType]
          expect(output).toContain(`${field.name}:`)
          expect(output).toContain(baseType)

          // Find the line for this specific field to check nullable
          const fieldLine = output
            .split("\n")
            .find((line) => new RegExp(`\\b${field.name}:`, "u").test(line))

          expect(fieldLine).toBeDefined()

          // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field
          if (required) {
            // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field
            expect(fieldLine).not.toContain(".nullable()")
          } else {
            // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field
            expect(fieldLine).toContain(".nullable()")
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
