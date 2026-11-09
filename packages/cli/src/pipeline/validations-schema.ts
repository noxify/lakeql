import {
  id,
  importNames,
  methodCall,
  property,
} from "@lakeql/file-generator/ast-builders"
import type { FieldDefinition } from "@lakeql/schema-generator/endpoint-schema"
import ts from "typescript"

/**
 * Parameters for generateValidationsSchema.
 */
export interface GenerateValidationsSchemaProps {
  /** The field definitions from the endpoint definition. */
  fields: FieldDefinition[]
}

/**
 * Determines whether a field tree contains any field with validations,
 * recursing into Object fields and Array-of-Object item fields.
 */
function hasAnyValidations(fields: FieldDefinition[]): boolean {
  return fields.some((field) => {
    if (field.options?.validations && field.options.validations.length > 0) {
      return true
    }
    if (field.type === "Object" && field.fields) {
      return hasAnyValidations(field.fields)
    }
    if (
      field.type === "Array" &&
      field.items?.type === "Object" &&
      field.items.fields
    ) {
      return hasAnyValidations(field.items.fields)
    }
    return false
  })
}

/**
 * Builds the list of schema properties for a set of fields, recursing into
 * nested Object fields and Array-of-Object item fields. A field is included
 * only when it (or one of its descendants) carries validations, so that the
 * emitted schema stays minimal while still covering nested validations.
 */
function buildSchemaProperties(
  fields: FieldDefinition[]
): ts.PropertyAssignment[] {
  const properties: ts.PropertyAssignment[] = []

  for (const field of fields) {
    const nestedExpression = buildNestedZodExpression(field)
    if (nestedExpression) {
      properties.push(property(field.name, nestedExpression))
      continue
    }

    if (field.options?.validations && field.options.validations.length > 0) {
      properties.push(property(field.name, buildFieldZodExpression(field)))
    }
  }

  return properties
}

/**
 * Builds a Zod expression for a structural field (Object or Array-of-Object)
 * when any of its nested fields carry validations.
 *
 * - Object → `z.object({ ... })`
 * - Array-of-Object → `z.array(z.object({ ... }))`
 *
 * Returns null when the field is not a structural type carrying nested
 * validations, so the caller can fall back to the primitive handling.
 */
function buildNestedZodExpression(
  field: FieldDefinition
): ts.Expression | null {
  if (field.type === "Object" && field.fields) {
    if (!hasAnyValidations(field.fields)) {
      return null
    }
    return wrapOptional(buildObjectZodExpression(field.fields), field)
  }

  if (
    field.type === "Array" &&
    field.items?.type === "Object" &&
    field.items.fields
  ) {
    if (!hasAnyValidations(field.items.fields)) {
      return null
    }
    return wrapOptional(
      methodCall("z", "array", [buildObjectZodExpression(field.items.fields)]),
      field
    )
  }

  return null
}

/**
 * Builds a `z.object({ ... })` expression from a set of fields, including only
 * fields (or descendants) that carry validations.
 */
function buildObjectZodExpression(fields: FieldDefinition[]): ts.Expression {
  return methodCall("z", "object", [
    ts.factory.createObjectLiteralExpression(
      buildSchemaProperties(fields),
      true
    ),
  ])
}

/**
 * Adds `.nullable()` to an expression when the field is not required.
 */
function wrapOptional(
  expression: ts.Expression,
  field: FieldDefinition
): ts.Expression {
  if (!field.options?.required) {
    return methodCall(expression, "nullable")
  }
  return expression
}

/**
 * Generates a validations.ts file containing a Zod object schema
 * derived from field options.validations in the endpoint definition.
 *
 * Recurses into nested Object fields and Array-of-Object item fields so that
 * validations declared on nested fields are emitted alongside root-level ones.
 *
 * Only generates when at least one field (at any nesting level) has validations
 * configured. Returns null when no fields have validations.
 */
export function generateValidationsSchema(
  fields: FieldDefinition[]
): ts.Node[] | null {
  // If no fields (at any nesting level) have validations, don't generate the file
  if (!hasAnyValidations(fields)) {
    return null
  }

  const zodImport = importNames("zod", ["z"])

  // Build the z.object({...}) schema expression, recursing into nested fields
  const schemaProperties = buildSchemaProperties(fields)

  const zodObjectCall = methodCall("z", "object", [
    ts.factory.createObjectLiteralExpression(schemaProperties, true),
  ])

  const exportedSchema = ts.factory.createVariableStatement(
    [ts.factory.createToken(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          id("validationSchema"),
          undefined,
          undefined,
          zodObjectCall
        ),
      ],
      ts.NodeFlags.Const
    )
  )

  return [zodImport, exportedSchema]
}

/**
 * Builds the Zod expression for a single field based on its type and validations.
 *
 * Derives the base Zod type from the field type:
 * - String → z.string()
 * - Integer → z.number().int()
 * - Float → z.number()
 * - Boolean → z.boolean()
 * - DateTime → z.string().datetime()
 *
 * Then chains validation refinements and adds .nullable() when not required.
 */
function buildFieldZodExpression(field: FieldDefinition): ts.Expression {
  let expression = getBaseZodType(field.type)

  // Chain validation refinements
  if (field.options?.validations) {
    for (const validation of field.options.validations) {
      expression = applyValidationRefinement(expression, validation)
    }
  }

  // Add .nullable() when options.required is false or not set
  if (!field.options?.required) {
    expression = methodCall(expression, "nullable")
  }

  return expression
}

/**
 * Returns the base Zod type expression for a given field type.
 */
function getBaseZodType(fieldType: FieldDefinition["type"]): ts.Expression {
  switch (fieldType) {
    case "String": {
      return methodCall("z", "string")
    }
    case "Integer": {
      return methodCall(methodCall("z", "number"), "int")
    }
    case "Float": {
      return methodCall("z", "number")
    }
    case "Boolean": {
      return methodCall("z", "boolean")
    }
    case "DateTime": {
      return methodCall(methodCall("z", "string"), "datetime")
    }
    case "Date": {
      return methodCall(methodCall("z", "string"), "date")
    }
    default: {
      // For Object and Array types, fall back to z.any()
      return methodCall("z", "any")
    }
  }
}

/**
 * Applies a single validation refinement to a Zod expression chain.
 */
function applyValidationRefinement(
  expression: ts.Expression,
  validation: NonNullable<
    NonNullable<FieldDefinition["options"]>["validations"]
  >[number]
): ts.Expression {
  switch (validation.type) {
    case "email": {
      return methodCall(expression, "email")
    }
    case "url": {
      return methodCall(expression, "url")
    }
    case "uuid": {
      return methodCall(expression, "uuid")
    }
    case "min": {
      return methodCall(expression, "min", [
        ts.factory.createNumericLiteral(validation.value),
      ])
    }
    case "max": {
      return methodCall(expression, "max", [
        ts.factory.createNumericLiteral(validation.value),
      ])
    }
    case "regex": {
      return methodCall(expression, "regex", [
        ts.factory.createNewExpression(id("RegExp"), undefined, [
          ts.factory.createStringLiteral(validation.pattern),
        ]),
      ])
    }
    default: {
      return expression
    }
  }
}
