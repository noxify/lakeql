import type { FieldDefinition } from "@lakeql/schema-generator/endpoint-schema"
import ts from "typescript"

import { id, importNames, methodCall, property } from "./ast-helpers"

/**
 * Parameters for generateValidationsSchema.
 */
export interface GenerateValidationsSchemaProps {
  /** The field definitions from the endpoint definition. */
  fields: FieldDefinition[]
}

/**
 * Generates a validations.ts file containing a Zod object schema
 * derived from field options.validations in the endpoint definition.
 *
 * Only generates when at least one field has validations configured.
 * Returns null when no fields have validations.
 */
export function generateValidationsSchema(
  fields: FieldDefinition[]
): ts.Node[] | null {
  // Collect only fields that have validations defined
  const fieldsWithValidations = fields.filter(
    (field) =>
      field.options?.validations && field.options.validations.length > 0
  )

  // If no fields have validations, don't generate the file
  if (fieldsWithValidations.length === 0) {
    return null
  }

  const zodImport = importNames("zod", ["z"])

  // Build the z.object({...}) schema expression
  const schemaProperties = fieldsWithValidations.map((field) =>
    property(field.name, buildFieldZodExpression(field))
  )

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
