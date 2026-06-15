// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects

import type { FieldDefinition } from "@lakeql/schema-generator/endpoint-schema"
import type { ModelResponse } from "@lakeql/schema-generator/graphql-schema"
import fc from "fast-check"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { generateMutationSchema } from "@/pipeline/mutation-schema"

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

/**
 * Extracts the `required: true/false` value for a specific field from generated output.
 * Looks for patterns like: `fieldName: t.string({ required: true })` or `t.int({ required: false })`
 */
function extractFieldRequired(
  output: string,
  fieldName: string
): boolean | undefined {
  // Match patterns like: fieldName: t.something({ required: true/false })
  // Use word boundary to prevent matching substrings of other field names
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
  const fieldRegex = new RegExp(
    `(?:^|[\\s,{])${escapedName}:\\s*t\\.\\w+\\(\\{[^}]*required:\\s*(true|false)`,
    "mu"
  )
  const match = fieldRegex.exec(output)
  if (match) {
    return match[1] === "true"
  }
  return undefined
}

// --- Arbitraries ---

/** Generate a valid field name matching /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/ */
const fieldNameArb = fc
  .tuple(
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz_"),
      minLength: 1,
      maxLength: 1,
    }),
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_"),
      minLength: 1,
      maxLength: 8,
    })
  )
  .map(([first, rest]) => first + rest)

/** Primitive GraphQL types for fields */
const graphqlPrimitiveTypes = ["String", "Int", "Float", "Boolean"] as const
type GraphQLPrimitiveType = (typeof graphqlPrimitiveTypes)[number]

const graphqlTypeArb: fc.Arbitrary<GraphQLPrimitiveType> = fc.constantFrom(
  ...graphqlPrimitiveTypes
)

/** Corresponding FieldDefinition types for each GraphQL type */
const graphqlToFieldType: Record<
  GraphQLPrimitiveType,
  FieldDefinition["type"]
> = {
  String: "String",
  Int: "Integer",
  Float: "Float",
  Boolean: "Boolean",
}

/** Generate a required setting: true, false, or absent (undefined) */
const requiredSettingArb: fc.Arbitrary<boolean | undefined> = fc.oneof(
  fc.constant(true),
  fc.constant(false),
  fc.constant(undefined as boolean | undefined)
)

/** Generate a single field with varied required settings */
const fieldArb = fc
  .tuple(fieldNameArb, graphqlTypeArb, requiredSettingArb)
  .map(([name, graphqlType, required]) => ({
    name,
    graphqlType,
    fieldDefType: graphqlToFieldType[graphqlType],
    required,
  }))

/** Generate a set of unique fields */
const fieldsArb = fc.uniqueArray(fieldArb, {
  minLength: 1,
  maxLength: 6,
  selector: (item) => item.name,
})

/**
 * Build ModelResponse and FieldDefinition[] from generated field data.
 */
function buildTestData(
  fields: {
    name: string
    graphqlType: GraphQLPrimitiveType
    fieldDefType: FieldDefinition["type"]
    required: boolean | undefined
  }[]
) {
  const modelFields: Record<string, ModelResponse["fields"][string]> = {}
  const fieldDefinitions: FieldDefinition[] = []

  for (const field of fields) {
    modelFields[field.name] = {
      name: field.name,
      rawFieldName: field.name,
      transformed: false,
      interfaceType: "string",
      graphqlType: field.graphqlType,
      graphqlTplType: `'${field.graphqlType}'`,
      isArray: false,
      nullable: true,
      filter: true,
    }

    const options: FieldDefinition["options"] =
      field.required === undefined ? undefined : { required: field.required }

    fieldDefinitions.push({
      name: field.name,
      type: field.fieldDefType,
      ...(options ? { options } : {}),
    })
  }

  const models: Record<string, ModelResponse> = {
    TestModel: {
      root: true,
      modelName: "TestModel",
      interfaceName: "TestModelInterface",
      fields: modelFields,
      transformFields: [],
      dateTimeFields: [],
    },
  }

  return { models, fieldDefinitions }
}

// --- Property Tests ---

describe("Property 10: Field Required/Nullable GraphQL Mapping", () => {
  it("marks fields as required (non-nullable) if and only if options.required is true", () => {
    fc.assert(
      fc.property(fieldsArb, (fields) => {
        const { models, fieldDefinitions } = buildTestData(fields)

        const result = generateMutationSchema({
          models,
          mutationName: "createTestModel",
          fieldDefinitions,
        })

        expect(result.length).toBeGreaterThan(0)
        const output = printNodes(result)

        for (const field of fields) {
          const isRequired = extractFieldRequired(output, field.name)
          expect(isRequired).toBeDefined()

          // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field
          if (field.required === true) {
            // options.required is true → field should be required (non-nullable)
            // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field
            expect(isRequired).toBeTruthy()
          } else {
            // options.required is false or absent → field should be nullable
            // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field
            expect(isRequired).toBeFalsy()
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it("marks fields as required when options.required is explicitly true (with mutationConfig)", () => {
    fc.assert(
      fc.property(fieldsArb, (fields) => {
        const { models, fieldDefinitions } = buildTestData(fields)

        const result = generateMutationSchema({
          models,
          mutationName: "createTestModel",
          mutationConfig: {
            loadStrategy: "full_load",
            basePath: "test/path",
          },
          fieldDefinitions,
        })

        expect(result.length).toBeGreaterThan(0)
        const output = printNodes(result)

        for (const field of fields) {
          const isRequired = extractFieldRequired(output, field.name)
          expect(isRequired).toBeDefined()

          // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field
          if (field.required === true) {
            // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field
            expect(isRequired).toBeTruthy()
          } else {
            // oxlint-disable-next-line vitest/no-conditional-expect -- property test checks per-field
            expect(isRequired).toBeFalsy()
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
