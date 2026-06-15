import type { ModelResponse } from "@lakeql/schema-generator/graphql-schema"
import ts from "typescript"

import {
  arrowFunction,
  bool,
  builderCall,
  constStatement,
  fieldsFunction,
  id,
  importNames,
  methodCall,
  objectLiteral,
  parameter,
  property,
  stringLiteral,
} from "./ast-helpers"

/**
 * Parameters for generateMutationSchema.
 */
export interface GenerateMutationSchemaProps {
  /** The model definitions keyed by model name. */
  models: Record<string, ModelResponse>
  /** The GraphQL mutation name for this table (e.g. "createTrackingUserEvents"). */
  mutationName: string
}

/**
 * Generates the Pothos mutation schema AST for a table endpoint.
 *
 * Produces:
 * - `builder.inputType` declarations for each model (root + nested)
 * - A `builder.mutationFields` call exposing the mutation
 * - A resolver stub returning Boolean with a placeholder comment
 */
export function generateMutationSchema({
  models,
  mutationName,
}: GenerateMutationSchemaProps): ts.Node[] {
  const rootModel = Object.values(models).find((model) => model.root)
  if (!rootModel) {
    return []
  }

  // Separate nested models from root model
  const nestedModels = Object.values(models).filter((model) => !model.root)

  return [
    generateBuilderImport(),
    ...nestedModels.map((model) => generateInputType(model, models)),
    generateInputType(rootModel, models),
    generateMutationFields(mutationName, rootModel),
  ]
}

/**
 * Generates the import statement: import { builder } from "../../builder"
 */
function generateBuilderImport(): ts.Node {
  return importNames("../../builder", ["builder"])
}

/**
 * Generates a `builder.inputType` declaration for a model.
 */
function generateInputType(
  model: ModelResponse,
  allModels: Record<string, ModelResponse>
): ts.Node {
  const inputTypeName = `${model.modelName}Input`

  const fieldProperties = Object.values(model.fields).map((field) =>
    generateInputField(field, allModels)
  )

  return constStatement(
    inputTypeName,
    builderCall("inputType", [
      stringLiteral(inputTypeName),
      objectLiteral([property("fields", fieldsFunction(fieldProperties))]),
    ])
  )
}

/**
 * Maps a field from the model to the appropriate Pothos input field call.
 */
function generateInputField(
  field: {
    name: string
    graphqlType: string
    isArray: boolean
  },
  allModels: Record<string, ModelResponse>
): ts.PropertyAssignment {
  const requiredOption = property("required", bool(true))

  if (field.isArray) {
    const innerType = field.graphqlType.replace(/^\[/u, "").replace(/\]$/u, "")

    const primitiveListMethod = getPrimitiveListMethod(innerType)
    if (primitiveListMethod) {
      return property(
        field.name,
        methodCall("t", primitiveListMethod, [
          objectLiteral([requiredOption], false),
        ])
      )
    }

    const nestedInputTypeName = `${innerType}Input`
    return property(
      field.name,
      methodCall("t", "field", [
        objectLiteral(
          [
            property(
              "type",
              ts.factory.createArrayLiteralExpression([id(nestedInputTypeName)])
            ),
            requiredOption,
          ],
          false
        ),
      ])
    )
  }

  const primitiveMethod = getPrimitiveMethod(field.graphqlType)
  if (primitiveMethod) {
    return property(
      field.name,
      methodCall("t", primitiveMethod, [objectLiteral([requiredOption], false)])
    )
  }

  const isNestedModel = Object.keys(allModels).includes(field.graphqlType)
  if (isNestedModel) {
    const nestedInputTypeName = `${field.graphqlType}Input`
    return property(
      field.name,
      methodCall("t", "field", [
        objectLiteral(
          [property("type", id(nestedInputTypeName)), requiredOption],
          false
        ),
      ])
    )
  }

  return property(
    field.name,
    methodCall("t", "string", [objectLiteral([requiredOption], false)])
  )
}

function getPrimitiveMethod(graphqlType: string): string | undefined {
  switch (graphqlType) {
    case "String": {
      return "string"
    }
    case "Int": {
      return "int"
    }
    case "Float": {
      return "float"
    }
    case "Boolean": {
      return "boolean"
    }
    default: {
      return undefined
    }
  }
}

function getPrimitiveListMethod(innerType: string): string | undefined {
  switch (innerType) {
    case "String": {
      return "stringList"
    }
    case "Int": {
      return "intList"
    }
    case "Float": {
      return "floatList"
    }
    case "Boolean": {
      return "booleanList"
    }
    default: {
      return undefined
    }
  }
}

/**
 * Generates the `builder.mutationFields` call.
 */
function generateMutationFields(
  mutationName: string,
  rootModel: ModelResponse
): ts.Node {
  const rootInputTypeName = `${rootModel.modelName}Input`

  const resolverBody = ts.factory.createBlock(
    [
      ts.addSyntheticLeadingComment(
        ts.factory.createReturnStatement(ts.factory.createTrue()),
        ts.SyntaxKind.SingleLineCommentTrivia,
        " TODO: Implement write logic here",
        true
      ),
    ],
    true
  )

  const resolver = arrowFunction(
    [
      parameter("_root"),
      ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        ts.factory.createObjectBindingPattern([
          ts.factory.createBindingElement(
            undefined,
            undefined,
            ts.factory.createIdentifier("input")
          ),
        ])
      ),
    ],
    resolverBody,
    { async: true }
  )

  const inputArg = methodCall("t", "arg", [
    objectLiteral(
      [
        property("type", id(rootInputTypeName)),
        property("required", bool(true)),
      ],
      false
    ),
  ])

  const mutationField = property(
    mutationName,
    methodCall("t", "boolean", [
      objectLiteral([
        property("args", objectLiteral([property("input", inputArg)], false)),
        property("resolve", resolver),
      ]),
    ])
  )

  return ts.factory.createExpressionStatement(
    builderCall("mutationFields", [fieldsFunction([mutationField])])
  )
}
