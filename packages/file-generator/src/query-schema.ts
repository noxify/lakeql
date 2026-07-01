import type {
  FilterFieldInput,
  ModelResponse,
} from "@lakeql/schema-generator/graphql-schema"
import ts from "typescript"

import {
  access,
  arrayLiteral,
  arrowFunction,
  asConst,
  bool,
  builderCall,
  builderInputRef,
  builderObjectRef,
  constStatement,
  expressionStatement,
  fieldsFunction,
  id,
  implement,
  importDefault,
  importNames,
  objectLiteral,
  parameter,
  property,
  shorthand,
  stringLiteral,
  tArg,
  tExpose,
  tField,
  typeRef,
} from "./ast-builders"

/**
 * Parameters for generateQuerySchema.
 */
export interface GenerateQuerySchemaProps {
  /** The model definitions keyed by model name. */
  models: Record<string, ModelResponse>
  /** The GraphQL query name for this table. */
  queryName: string
  /** Field name mappings for transformed fields (original to renamed). */
  transformFields: string[][]
  /** Filter field definitions for the query input. */
  filterFields: FilterFieldInput[]
  /** The GraphQL scalar types used in filters. */
  filterTypes: string[]
  /** Field names that contain date-time values. */
  dateTimeFields: string[]
}

/**
 * Generates the Pothos query schema AST for a table.
 */
export function generateQuerySchema({
  models,
  queryName,
  transformFields,
  filterFields,
  filterTypes,
  dateTimeFields,
}: GenerateQuerySchemaProps): ts.Node[] {
  const rootModel = Object.values(models).find((model) => model.root)

  if (!rootModel) {
    throw new Error("generateQuerySchema requires exactly one root model")
  }

  return [
    ...generateImports({ filterTypes, models }),
    ...generateFilterInput({ filterFields, rootModel }),
    ...generateSortFields({ filterFields, rootModel }),
    ...generateSortingInput({ rootModel }),
    ...generateObjectRefs({ models, rootModel }),
    ...generateModelImplement({ models }),
    ...generateTransformFields({ transformFields }),
    ...generateDateFields({ dateTimeFields }),
    ...generateQueryFields({ queryName }),
  ]
}

function calculateComparison(filterField: FilterFieldInput) {
  switch (filterField.type) {
    case "String": {
      return "StringFieldComparison"
    }
    case "Int": {
      return "IntFieldComparison"
    }
    case "Float": {
      return "FloatFieldComparison"
    }
    case "Boolean": {
      return "BooleanFieldComparison"
    }
    case "Date": {
      return "DateFieldComparison"
    }
    case "DateTime": {
      return "DateTimeFieldComparison"
    }
    case "ID": {
      return "IDFieldComparison"
    }
    default: {
      return filterField.type
    }
  }
}

function generateImports({
  models,
  filterTypes,
}: {
  models: Record<string, ModelResponse>
  filterTypes: string[]
}): ts.Node[] {
  return [
    importNames(
      "@lakeql/api/types",
      ["ConnectionInterface", "TrinoArrayResponse"],
      {
        typeOnly: true,
      }
    ),
    importNames("json-schema", ["JSONSchema7"], { typeOnly: true }),
    importNames("@lakeql/api/builder", [
      "builder",
      ...filterTypes.map((type) => `${type}FieldComparison`),
      "PageInfo",
      "Paging",
      "SortDirection",
    ]),
    importNames("~/env", ["env"]),
    importNames("@lakeql/api/helpers", [
      "calculatePageInfoData",
      "handleErrorResponse",
      "transformTrinoResponse",
    ]),
    importNames("@lakeql/query-builder", ["SortInput"], { typeOnly: true }),
    importNames("@lakeql/query-builder", [
      "formatQuery",
      "generateQuery",
      "getSelectFields",
    ]),
    importNames("@lakeql/trino-client", ["TrinoClient"]),
    importNames(
      "./interface",
      [
        ...Object.values(models).map((model) => model.interfaceName),
        "TableDefinition",
      ],
      { typeOnly: true }
    ),
    importNames("./config", ["hiveConfig"]),
    importDefault("./json-schema.json", "jsonSchema"),
  ]
}

function generateFilterInput({
  rootModel,
  filterFields,
}: {
  rootModel: ModelResponse
  filterFields: FilterFieldInput[]
}): ts.Node[] {
  return [
    constStatement(
      "FilterInput",
      implement(builderInputRef(`${rootModel.modelName}FilterInput`), [
        property(
          "fields",
          fieldsFunction([
            ...filterFields.map((field) =>
              property(
                field.name,
                tField([property("type", id(calculateComparison(field)))])
              )
            ),
            property(
              "and",
              tField([property("type", arrayLiteral([id("FilterInput")]))])
            ),
            property(
              "or",
              tField([property("type", arrayLiteral([id("FilterInput")]))])
            ),
          ])
        ),
      ])
    ),
  ]
}

function createRequiredField(
  name: string,
  typeName: string
): ts.PropertyAssignment {
  return property(
    name,
    tField([property("type", id(typeName)), property("required", bool(true))])
  )
}

function createExposeField(
  name: string,
  type: ts.Expression,
  options: ts.ObjectLiteralElementLike[] = []
): ts.PropertyAssignment {
  return property(name, tExpose(name, [property("type", type), ...options]))
}

function createBuilderFieldsImplementation(
  properties: ts.ObjectLiteralElementLike[]
): ts.PropertyAssignment[] {
  return [property("fields", fieldsFunction(properties))]
}

function generateSortFields({
  rootModel,
  filterFields,
}: {
  rootModel: ModelResponse
  filterFields: FilterFieldInput[]
}): ts.Node[] {
  return [
    constStatement(
      "SortFields",
      builderCall("enumType", [
        stringLiteral(`${rootModel.modelName}SortFields`),
        objectLiteral([
          property(
            "values",
            asConst(
              arrayLiteral(
                filterFields.map((field) => stringLiteral(field.name)),
                true
              )
            )
          ),
        ]),
      ])
    ),
  ]
}

function generateSortingInput({
  rootModel,
}: {
  rootModel: ModelResponse
}): ts.Node[] {
  return [
    constStatement(
      "SortingInput",
      implement(
        builderInputRef(`${rootModel.modelName}SortOrder`),
        createBuilderFieldsImplementation([
          createRequiredField("field", "SortFields"),
          createRequiredField("direction", "SortDirection"),
        ])
      )
    ),
  ]
}

function generateObjectRefs({
  rootModel,
  models,
}: {
  rootModel: ModelResponse
  models: Record<string, ModelResponse>
}): ts.Node[] {
  return [
    ...Object.values(models).map((model) =>
      constStatement(
        model.modelName,
        builderObjectRef(model.modelName, [typeRef(model.interfaceName)])
      )
    ),
    constStatement(
      "Connection",
      builderObjectRef(`${rootModel.modelName}Connection`, [
        typeRef("ConnectionInterface", [typeRef(rootModel.interfaceName)]),
      ])
    ),
    expressionStatement(
      implement(
        "Connection",
        createBuilderFieldsImplementation([
          createExposeField("totalCount", stringLiteral("Int")),
          createExposeField("pageInfo", id("PageInfo")),
          createExposeField("nodes", arrayLiteral([id(rootModel.modelName)]), [
            property("nullable", bool(false)),
          ]),
        ])
      )
    ),
  ]
}

function generateModelImplement({
  models,
}: {
  models: Record<string, ModelResponse>
}): ts.Node[] {
  return Object.values(models)
    .toReversed()
    .map((model) => {
      const fields = Object.values(model.fields).map((field) => {
        const propertyAssignment = createExposeField(
          field.name,
          id(field.graphqlTplType),
          [property("nullable", bool(true))]
        )

        if (field.graphqlType === "DateTime" || field.graphqlType === "Date") {
          ts.addSyntheticLeadingComment(
            propertyAssignment.initializer,
            ts.SyntaxKind.SingleLineCommentTrivia,
            ` @ts-expect-error not sure why, but it doesn't get the type`,
            true
          )
          ts.addSyntheticLeadingComment(
            propertyAssignment.initializer,
            ts.SyntaxKind.SingleLineCommentTrivia,
            ` GH Issue: https://github.com/hayes/pothos/issues/1277`,
            true
          )
        }

        return propertyAssignment
      })

      return expressionStatement(
        implement(model.modelName, createBuilderFieldsImplementation(fields))
      )
    })
}

function generateTransformFields({
  transformFields,
}: {
  transformFields: string[][]
}): ts.Node[] {
  const uniqueTransformFields = new Map<string, string>()

  for (const entry of transformFields) {
    const [key, value] = entry

    if (key === undefined || value === undefined) {
      continue
    }

    const existingValue = uniqueTransformFields.get(key)

    if (existingValue !== undefined && existingValue !== value) {
      throw new Error(
        `Conflicting transform field mapping for "${key}": "${existingValue}" vs "${value}".`
      )
    }

    uniqueTransformFields.set(key, value)
  }

  return [
    ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier("transformFields"),
            undefined,
            ts.factory.createTypeReferenceNode("Record", [
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
            ]),
            objectLiteral(
              [...uniqueTransformFields.entries()].map(([key, value]) =>
                property(key, stringLiteral(value))
              )
            )
          ),
        ],
        ts.NodeFlags.Const
      )
    ),
  ]
}

function generateDateFields({
  dateTimeFields,
}: {
  dateTimeFields: string[]
}): ts.Node[] {
  return [
    ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier("dateFields"),
            undefined,
            ts.factory.createArrayTypeNode(
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
            ),
            arrayLiteral(dateTimeFields.map((field) => stringLiteral(field)))
          ),
        ],
        ts.NodeFlags.Const
      )
    ),
  ]
}

function createArgField(
  name: string,
  type: ts.Expression,
  required: boolean
): ts.PropertyAssignment {
  return property(
    name,
    tArg([property("type", type), property("required", bool(required))])
  )
}

function createConstDeclarationStatement(
  declarations: ts.VariableDeclaration[]
): ts.VariableStatement {
  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(declarations, ts.NodeFlags.Const)
  )
}

function createPagingValue(
  fieldName: "page" | "perPage",
  fallback: string
): ts.Expression {
  return ts.factory.createBinaryExpression(
    ts.factory.createPropertyAccessChain(
      access("args", "paging"),
      ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
      id(fieldName)
    ),
    ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
    ts.factory.createNumericLiteral(fallback)
  )
}

function createPageInfoRequest(
  totalCount: ts.Expression
): ts.ObjectLiteralExpression {
  return objectLiteral([
    property("totalCount", totalCount),
    property("page", createPagingValue("page", "1")),
    property("perPage", createPagingValue("perPage", "100")),
  ])
}

function createCalculatePageInfoCall(
  totalCount: ts.Expression
): ts.CallExpression {
  return ts.factory.createCallExpression(
    id("calculatePageInfoData"),
    undefined,
    [createPageInfoRequest(totalCount)]
  )
}

function createOffsetLimitStatement(): ts.VariableStatement {
  return createConstDeclarationStatement([
    ts.factory.createVariableDeclaration(
      ts.factory.createObjectBindingPattern([
        ts.factory.createBindingElement(undefined, undefined, id("offset")),
        ts.factory.createBindingElement(undefined, undefined, id("limit")),
      ]),
      undefined,
      undefined,
      createCalculatePageInfoCall(ts.factory.createNumericLiteral("0"))
    ),
  ])
}

function createSelectFieldsStatement(): ts.VariableStatement {
  return createConstDeclarationStatement([
    ts.factory.createVariableDeclaration(
      id("selectFields"),
      undefined,
      undefined,
      ts.factory.createCallExpression(
        id("getSelectFields"),
        [typeRef("TableDefinition")],
        [id("info"), bool(true)]
      )
    ),
  ])
}

function createGeneratedQueryStatement(): ts.VariableStatement {
  return createConstDeclarationStatement([
    ts.factory.createVariableDeclaration(
      id("query"),
      undefined,
      undefined,
      ts.factory.createCallExpression(
        id("generateQuery"),
        [typeRef("TableDefinition")],
        [
          objectLiteral([
            shorthand("selectFields"),
            property("schema", access("hiveConfig", "schema")),
            property("table", access("hiveConfig", "tableName")),
            shorthand("transformFields"),
            property("catalog", access("hiveConfig", "catalog")),
            property(
              "userQuery",
              ts.factory.createBinaryExpression(
                access("args", "filter"),
                ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
                objectLiteral([], false)
              )
            ),
            shorthand("dateFields"),
            property(
              "paging",
              objectLiteral([shorthand("offset"), shorthand("limit")])
            ),
            property(
              "sorting",
              ts.factory.createAsExpression(
                access("args", "sorting"),
                ts.factory.createArrayTypeNode(
                  typeRef("SortInput", [typeRef("TableDefinition")])
                )
              )
            ),
          ]),
        ]
      )
    ),
  ])
}

function createClientStatement(): ts.VariableStatement {
  return createConstDeclarationStatement([
    ts.factory.createVariableDeclaration(
      id("client"),
      undefined,
      undefined,
      ts.factory.createNewExpression(id("TrinoClient"), undefined, [
        objectLiteral([
          property("host", access("env", "HIVE_HOST")),
          property("port", access("env", "HIVE_PORT")),
          property(
            "auth",
            objectLiteral([
              property("type", stringLiteral("basic")),
              property("username", access("env", "HIVE_USERNAME")),
              property("password", access("env", "HIVE_PASSWORD")),
            ])
          ),
          property("catalog", access("env", "HIVE_CATALOG")),
          property("source", access("env", "HIVE_SOURCE")),
        ]),
      ])
    ),
  ])
}

function createRecordsStatement(): ts.VariableStatement {
  return createConstDeclarationStatement([
    ts.factory.createVariableDeclaration(
      id("records"),
      undefined,
      undefined,
      ts.factory.createAwaitExpression(
        ts.factory.createCallExpression(
          access(
            ts.factory.createCallExpression(
              access(id("client"), "query"),
              [typeRef("TrinoArrayResponse", [typeRef("TableDefinition")])],
              [
                objectLiteral(
                  [
                    property(
                      "sql",
                      ts.factory.createCallExpression(
                        id("formatQuery"),
                        [typeRef("TableDefinition")],
                        [objectLiteral([shorthand("query")], false)]
                      )
                    ),
                  ],
                  true
                ),
              ]
            ),
            "catch"
          ),
          undefined,
          [
            arrowFunction(
              [
                ts.factory.createParameterDeclaration(
                  undefined,
                  undefined,
                  id("e"),
                  undefined,
                  ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
                ),
              ],
              ts.factory.createBlock(
                [
                  ts.addSyntheticLeadingComment(
                    ts.factory.createThrowStatement(
                      ts.factory.createCallExpression(
                        id("handleErrorResponse"),
                        undefined,
                        [
                          objectLiteral(
                            [
                              property("errorMessage", id("e")),
                              shorthand("context"),
                              shorthand("info"),
                            ],
                            false
                          ),
                        ]
                      )
                    ),
                    ts.SyntaxKind.SingleLineCommentTrivia,
                    ` @ts-expect-error e is unknown - ignore it for now`,
                    true
                  ),
                ],
                true
              )
            ),
          ]
        )
      )
    ),
  ])
}

function createTransformedResponseStatement(): ts.VariableStatement {
  return createConstDeclarationStatement([
    ts.factory.createVariableDeclaration(
      ts.factory.createObjectBindingPattern([
        ts.factory.createBindingElement(
          undefined,
          undefined,
          id("total_count")
        ),
        ts.factory.createBindingElement(undefined, undefined, id("data")),
      ]),
      undefined,
      undefined,
      ts.factory.createCallExpression(id("transformTrinoResponse"), undefined, [
        objectLiteral([
          property("response", id("records")),
          property(
            "selectFields",
            ts.factory.createAsExpression(
              id("selectFields"),
              ts.factory.createArrayTypeNode(
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
              )
            )
          ),
          shorthand("dateFields"),
          shorthand("transformFields"),
          property(
            "jsonSchema",
            ts.factory.createAsExpression(
              id("jsonSchema"),
              typeRef("JSONSchema7")
            )
          ),
        ]),
      ])
    ),
  ])
}

function createResolvedPageInfoStatement(): ts.VariableStatement {
  return createConstDeclarationStatement([
    ts.factory.createVariableDeclaration(
      ts.factory.createObjectBindingPattern([
        ts.factory.createBindingElement(undefined, undefined, id("totalCount")),
        ts.factory.createBindingElement(
          ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
          undefined,
          id("pageInfo")
        ),
      ]),
      undefined,
      undefined,
      createCalculatePageInfoCall(id("total_count"))
    ),
  ])
}

function createResolverReturnStatement(): ts.ReturnStatement {
  return ts.factory.createReturnStatement(
    objectLiteral([
      shorthand("totalCount"),
      shorthand("pageInfo"),
      property("nodes", id("data")),
    ])
  )
}

function createReadPermission(): ts.ObjectLiteralExpression {
  return objectLiteral([
    property("catalog", access("hiveConfig", "catalog")),
    property("schema", access("hiveConfig", "schema")),
    property("tableName", access("hiveConfig", "tableName")),
  ])
}

function createAuthScopes(): ts.ObjectLiteralExpression {
  return objectLiteral([
    property("authorized", bool(true)),
    property("readPermission", createReadPermission()),
  ])
}

function createResolver(): ts.ArrowFunction {
  return arrowFunction(
    [
      parameter("_parent"),
      parameter("args"),
      parameter("context"),
      parameter("info"),
    ],
    ts.factory.createBlock(
      [
        createOffsetLimitStatement(),
        createSelectFieldsStatement(),
        createGeneratedQueryStatement(),
        createClientStatement(),
        createRecordsStatement(),
        createTransformedResponseStatement(),
        createResolvedPageInfoStatement(),
        createResolverReturnStatement(),
      ],
      true
    ),
    { async: true }
  )
}

function createQueryField(queryName: string): ts.PropertyAssignment {
  return property(
    queryName,
    tField([
      property("type", id("Connection")),
      property(
        "args",
        objectLiteral([
          createArgField("filter", id("FilterInput"), false),
          createArgField("paging", id("Paging"), false),
          createArgField("sorting", arrayLiteral([id("SortingInput")]), true),
        ])
      ),
      property("authScopes", createAuthScopes()),
      property("resolve", createResolver()),
    ])
  )
}

function generateQueryFields({ queryName }: { queryName: string }): ts.Node[] {
  return [
    builderCall("queryFields", [fieldsFunction([createQueryField(queryName)])]),
  ]
}
