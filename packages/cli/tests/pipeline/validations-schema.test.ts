import type { FieldDefinition } from "@lakeql/schema-generator/endpoint-schema"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { generateValidationsSchema } from "@/pipeline/validations-schema"

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

describe(generateValidationsSchema, () => {
  it("returns null when no fields have validations", () => {
    const fields: FieldDefinition[] = [
      { name: "name", type: "String" },
      { name: "age", type: "Integer", options: { required: true } },
    ]

    const result = generateValidationsSchema(fields)
    expect(result).toBeNull()
  })

  it("returns null when fields have empty validations array", () => {
    const fields: FieldDefinition[] = [
      {
        name: "name",
        type: "String",
        options: { validations: [] },
      },
    ]

    const result = generateValidationsSchema(fields)
    expect(result).toBeNull()
  })

  it("generates Zod import and exported schema", () => {
    const fields: FieldDefinition[] = [
      {
        name: "email",
        type: "String",
        options: { required: true, validations: [{ type: "email" }] },
      },
    ]

    const result = generateValidationsSchema(fields)
    expect(result).not.toBeNull()

    const output = printNodes(result as ts.Node[])
    expect(output).toContain('import { z } from "zod"')
    expect(output).toContain("export const validationSchema")
  })

  it("derives z.string() for String type", () => {
    const fields: FieldDefinition[] = [
      {
        name: "email",
        type: "String",
        options: { required: true, validations: [{ type: "email" }] },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])
    expect(output).toContain("z.string().email()")
  })

  it("derives z.number().int() for Integer type", () => {
    const fields: FieldDefinition[] = [
      {
        name: "age",
        type: "Integer",
        options: { required: true, validations: [{ type: "min", value: 0 }] },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])
    expect(output).toContain("z.number().int().min(0)")
  })

  it("derives z.number() for Float type", () => {
    const fields: FieldDefinition[] = [
      {
        name: "score",
        type: "Float",
        options: {
          required: true,
          validations: [{ type: "max", value: 100 }],
        },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])
    expect(output).toContain("z.number().max(100)")
  })

  it("derives z.boolean() for Boolean type", () => {
    const fields: FieldDefinition[] = [
      {
        name: "active",
        type: "Boolean",
        options: { required: true, validations: [{ type: "email" }] },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])
    // Boolean base type — though email refinement is semantically odd,
    // the generator follows the definition literally
    expect(output).toContain("z.boolean()")
  })

  it("derives z.string().datetime() for DateTime type", () => {
    const fields: FieldDefinition[] = [
      {
        name: "created_at",
        type: "DateTime",
        options: { required: true, validations: [{ type: "uuid" }] },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])
    expect(output).toContain("z.string().datetime().uuid()")
  })

  it("chains multiple validation refinements", () => {
    const fields: FieldDefinition[] = [
      {
        name: "age",
        type: "Integer",
        options: {
          required: true,
          validations: [
            { type: "min", value: 0 },
            { type: "max", value: 150 },
          ],
        },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])
    expect(output).toContain("z.number().int().min(0).max(150)")
  })

  it("adds .nullable() when options.required is false", () => {
    const fields: FieldDefinition[] = [
      {
        name: "email",
        type: "String",
        options: { required: false, validations: [{ type: "email" }] },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])
    expect(output).toContain("z.string().email().nullable()")
  })

  it("adds .nullable() when options.required is not set", () => {
    const fields: FieldDefinition[] = [
      {
        name: "website",
        type: "String",
        options: { validations: [{ type: "url" }] },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])
    expect(output).toContain("z.string().url().nullable()")
  })

  it("does not add .nullable() when options.required is true", () => {
    const fields: FieldDefinition[] = [
      {
        name: "email",
        type: "String",
        options: { required: true, validations: [{ type: "email" }] },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])
    expect(output).toContain("z.string().email()")
    expect(output).not.toContain("nullable")
  })

  it("handles regex validation with pattern", () => {
    const fields: FieldDefinition[] = [
      {
        name: "code",
        type: "String",
        options: {
          required: true,
          validations: [{ type: "regex", pattern: "^[A-Z]{3}$" }],
        },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])
    expect(output).toContain("z.string().regex(new RegExp(")
    expect(output).toContain("^[A-Z]{3}$")
  })

  it("handles uuid validation", () => {
    const fields: FieldDefinition[] = [
      {
        name: "id",
        type: "String",
        options: { required: true, validations: [{ type: "uuid" }] },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])
    expect(output).toContain("z.string().uuid()")
  })

  it("only includes fields that have validations in the schema", () => {
    const fields: FieldDefinition[] = [
      {
        name: "email",
        type: "String",
        options: { required: true, validations: [{ type: "email" }] },
      },
      { name: "name", type: "String", options: { required: true } },
      {
        name: "website",
        type: "String",
        options: { validations: [{ type: "url" }] },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])

    expect(output).toContain("email:")
    expect(output).toContain("website:")
    expect(output).not.toContain("name:")
  })

  it("generates z.object with multiple fields", () => {
    const fields: FieldDefinition[] = [
      {
        name: "email",
        type: "String",
        options: { required: true, validations: [{ type: "email" }] },
      },
      {
        name: "age",
        type: "Integer",
        options: {
          required: false,
          validations: [
            { type: "min", value: 0 },
            { type: "max", value: 150 },
          ],
        },
      },
    ]

    const result = generateValidationsSchema(fields)
    const output = printNodes(result as ts.Node[])

    expect(output).toContain("z.object(")
    expect(output).toContain("email: z.string().email()")
    expect(output).toContain("age: z.number().int().min(0).max(150).nullable()")
  })
})
