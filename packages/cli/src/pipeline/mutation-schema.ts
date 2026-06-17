import type {
  FieldDefinition,
  MutationConfig,
} from "@lakeql/schema-generator/endpoint-schema"
import type { ModelResponse } from "@lakeql/schema-generator/graphql-schema"
import ts from "typescript"

import {
  access,
  arrowFunction,
  bool,
  builderCall,
  call,
  constStatement,
  fieldsFunction,
  id,
  importDefault,
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
  /** The mutation pipeline configuration from the endpoint definition (false or config object). */
  mutationConfig?: false | MutationConfig
  /** Whether validations.ts will be generated (at least one field has validations). */
  hasValidations?: boolean
  /** Optional field definitions with options (for required/nullable mapping). */
  fieldDefinitions?: FieldDefinition[]
}

/**
 * Generates the Pothos mutation schema AST for a table endpoint.
 *
 * When mutationConfig is present (not false/absent), produces a working resolver
 * that validates input (if validations exist) and calls executeWritePipeline.
 *
 * When mutationConfig is absent or false, returns an empty array (no file generated).
 *
 * When mutationConfig is undefined but models exist (legacy mode), produces the
 * input types and mutation fields with a placeholder resolver for backward compatibility.
 */
export function generateMutationSchema({
  models,
  mutationName,
  mutationConfig,
  hasValidations,
  fieldDefinitions,
}: GenerateMutationSchemaProps): ts.Node[] {
  // When mutation is absent or explicitly set to false, do NOT generate mutation-schema.ts
  if (!mutationConfig) {
    return []
  }

  const rootModel = Object.values(models).find((model) => model.root)
  if (!rootModel) {
    return []
  }

  // Build a lookup map from field name → options.required
  const requiredMap = buildRequiredMap(fieldDefinitions)

  // Build a set of field names that are read-only (excluded from mutation input)
  const excludedSet = buildExcludedSet(fieldDefinitions)

  // Separate nested models from root model
  const nestedModels = Object.values(models).filter((model) => !model.root)

  // mutationConfig is a config object — generate a real resolver
  return [
    ...generateRealResolverImports(hasValidations),
    ...nestedModels.map((model) =>
      generateInputType(model, models, requiredMap, excludedSet)
    ),
    generateInputType(rootModel, models, requiredMap, excludedSet),
    generateRealMutationFields(mutationName, rootModel, hasValidations),
  ]
}

/**
 * Builds a map from field name → whether the field is required based on field definitions.
 * When fieldDefinitions are provided, uses options.required (defaulting to false when absent).
 * When fieldDefinitions are not provided, returns an empty map (all fields default to required: true for backward compat).
 */
function buildRequiredMap(
  fieldDefinitions?: FieldDefinition[]
): Map<string, boolean> {
  const map = new Map<string, boolean>()
  if (!fieldDefinitions) {
    return map
  }
  for (const field of fieldDefinitions) {
    // options.required defaults to false when options is absent or required is not set
    const isRequired = field.options?.required === true
    map.set(field.name, isRequired)
  }
  return map
}

/**
 * Builds a set of field names that have readOnly: true.
 * These fields should be excluded from mutation input types.
 */
function buildExcludedSet(fieldDefinitions?: FieldDefinition[]): Set<string> {
  const set = new Set<string>()
  if (!fieldDefinitions) {
    return set
  }
  for (const field of fieldDefinitions) {
    if (field.options?.readOnly === true) {
      set.add(field.name)
    }
  }
  return set
}

/**
 * Generates all imports needed for the real mutation resolver.
 */
function generateRealResolverImports(
  hasValidations?: boolean
): ts.ImportDeclaration[] {
  const imports: ts.ImportDeclaration[] = [
    importNames("@lakeql/adapters", ["executeWritePipeline"]),
    importNames("@lakeql/trino-client", ["TrinoClient"]),
    importNames("@lakeql/api/builder", ["builder"]),
    importNames("~/env", ["env"]),
    importNames("./config", ["hiveConfig", "storageConfig"]),
    importDefault("./json-schema.json", "jsonSchema"),
  ]

  if (hasValidations) {
    imports.push(importNames("./validations", ["validationSchema"]))
  }

  return imports
}

/**
 * Generates a `builder.inputType` declaration for a model.
 */
function generateInputType(
  model: ModelResponse,
  allModels: Record<string, ModelResponse>,
  requiredMap: Map<string, boolean>,
  excludedSet: Set<string>
): ts.Node {
  const inputTypeName = `${model.modelName}Input`

  const fieldProperties = Object.values(model.fields)
    .filter((field) => !excludedSet.has(field.name))
    .map((field) => generateInputField(field, allModels, requiredMap))

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
  allModels: Record<string, ModelResponse>,
  requiredMap: Map<string, boolean>
): ts.PropertyAssignment {
  // Determine required from field options: true only if options.required is explicitly true
  const isRequired = requiredMap.get(field.name) ?? true
  const requiredOption = property("required", bool(isRequired))

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
 * Generates the `builder.mutationFields` call with a real resolver
 * that validates input and calls executeWritePipeline.
 */
function generateRealMutationFields(
  mutationName: string,
  rootModel: ModelResponse,
  hasValidations?: boolean
): ts.Node {
  const rootInputTypeName = `${rootModel.modelName}Input`

  // Build resolver body statements
  const resolverStatements: ts.Statement[] = []

  // If validations exist, add: validationSchema.parse(input)
  if (hasValidations) {
    resolverStatements.push(
      ts.factory.createExpressionStatement(
        methodCall("validationSchema", "parse", [id("input")])
      )
    )
  }

  // Create TrinoClient instance:
  // const trinoClient = new TrinoClient({ host: env.HIVE_HOST, port: env.HIVE_PORT, auth: {...}, catalog: env.HIVE_CATALOG, source: env.HIVE_SOURCE })
  resolverStatements.push(
    ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            id("trinoClient"),
            undefined,
            undefined,
            ts.factory.createNewExpression(id("TrinoClient"), undefined, [
              objectLiteral([
                property("host", access("env", "HIVE_HOST")),
                property("port", access("env", "HIVE_PORT")),
                property(
                  "auth",
                  objectLiteral(
                    [
                      property("type", stringLiteral("basic")),
                      property("username", access("env", "HIVE_USERNAME")),
                      property("password", access("env", "HIVE_PASSWORD")),
                    ],
                    false
                  )
                ),
                property("catalog", access("env", "HIVE_CATALOG")),
                property("source", access("env", "HIVE_SOURCE")),
              ]),
            ])
          ),
        ],
        ts.NodeFlags.Const
      )
    )
  )

  // await executeWritePipeline({ records: input, jsonSchema, config: { ... } })
  const pipelineCall = ts.factory.createAwaitExpression(
    call(id("executeWritePipeline"), [
      objectLiteral([
        property("records", id("input")),
        property(
          "jsonSchema",
          ts.factory.createAsExpression(
            id("jsonSchema"),
            ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
          )
        ),
        property(
          "config",
          objectLiteral([
            property("loadStrategy", access("storageConfig", "loadStrategy")),
            property("bucket", access("storageConfig", "bucket")),
            property("basePath", access("storageConfig", "basePath")),
            property(
              "table",
              objectLiteral(
                [
                  property("catalog", access("hiveConfig", "catalog")),
                  property("schema", access("hiveConfig", "schema")),
                  property("tableName", access("hiveConfig", "tableName")),
                ],
                false
              )
            ),
            property("trinoClient", id("trinoClient")),
          ])
        ),
      ]),
    ])
  )

  resolverStatements.push(ts.factory.createExpressionStatement(pipelineCall))

  // return true
  resolverStatements.push(
    ts.factory.createReturnStatement(ts.factory.createTrue())
  )

  const resolverBody = ts.factory.createBlock(resolverStatements, true)

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
