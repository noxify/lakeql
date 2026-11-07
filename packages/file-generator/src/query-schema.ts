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
    ...generateQueryFields({
      queryName,
      nodeInterfaceName: rootModel.interfaceName,
    }),
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
    importNames("@lakeql/api/types", ["ConnectionInterface"], {
      typeOnly: true,
    }),
    importNames("@lakeql/api/builder", [
      "builder",
      ...filterTypes.map((type) => `${type}FieldComparison`),
      "PageInfo",
      "Paging",
      "SortDirection",
    ]),
    importNames("@lakeql/api/helpers", ["handleErrorResponse"]),
    importNames("@lakeql/query-builder", ["getSelectFields"]),
    importNames(
      "./interface",
      Object.values(models).map((model) => model.interfaceName),
      { typeOnly: true }
    ),
    importNames("./config", ["sourceConfig"]),
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

function createReadPermission(): ts.ObjectLiteralExpression {
  return objectLiteral([
    property("dataSource", access("sourceConfig", "dataSource")),
    property("tableName", access("sourceConfig", "tableName")),
    property("catalog", access("sourceConfig", "catalog")),
    property("schema", access("sourceConfig", "schema")),
  ])
}

function createAuthScopes(): ts.ObjectLiteralExpression {
  return objectLiteral([
    property("authorized", bool(true)),
    property("readPermission", createReadPermission()),
  ])
}

/**
 * Creates the resolver function that delegates to the runtime read strategy.
 *
 * Generated code:
 * ```ts
 * async (_parent, args, context, info) => {
 *   const readStrategy = context.getReadStrategy(sourceConfig.dataSource)
 *   return readStrategy.read({
 *     sourceConfig,
 *     selectFields: getSelectFields<TableDefinition>({ graphqlInfo: info, withNodes: true }),
 *     filter: args.filter ?? {},
 *     paging: { page: args.paging?.page ?? 1, perPage: args.paging?.perPage },
 *     sorting: args.sorting,
 *     transformFields,
 *     dateFields,
 *     schema: jsonSchema,
 *     context,
 *   })
 * }
 * ```
 */
function createResolver(nodeInterfaceName: string): ts.ArrowFunction {
  // const readStrategy = context.getReadStrategy(sourceConfig.dataSource)
  const readStrategyStatement = ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          id("readStrategy"),
          undefined,
          undefined,
          ts.factory.createCallExpression(
            access(id("context"), "getReadStrategy"),
            undefined,
            [access("sourceConfig", "dataSource")]
          )
        ),
      ],
      ts.NodeFlags.Const
    )
  )

  // return readStrategy.read<NodeInterface>({ ... })
  // `return await` (not bare `return`) so the enclosing try/catch actually
  // catches the read's async rejection; a bare `return promise` in an async
  // function settles outside the try and the catch never runs.
  const returnStatement = ts.factory.createReturnStatement(
    ts.factory.createAwaitExpression(
      ts.factory.createCallExpression(
        access(id("readStrategy"), "read"),
        [typeRef(nodeInterfaceName)],
        [
          objectLiteral([
            shorthand("sourceConfig"),
            property(
              "selectFields",
              ts.factory.createCallExpression(
                id("getSelectFields"),
                undefined,
                [
                  objectLiteral(
                    [
                      property("graphqlInfo", id("info")),
                      property("withNodes", bool(true)),
                    ],
                    false
                  ),
                ]
              )
            ),
            property(
              "filter",
              ts.factory.createBinaryExpression(
                access("args", "filter"),
                ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
                objectLiteral([], false)
              )
            ),
            property(
              "paging",
              objectLiteral(
                [
                  property("page", createPagingValue("page", "1")),
                  property(
                    "perPage",
                    ts.factory.createPropertyAccessChain(
                      access("args", "paging"),
                      ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
                      id("perPage")
                    )
                  ),
                ],
                false
              )
            ),
            property("sorting", access("args", "sorting")),
            shorthand("transformFields"),
            shorthand("dateFields"),
            property("schema", id("jsonSchema")),
            shorthand("context"),
          ]),
        ]
      )
    )
  )

  // try { return await readStrategy.read<…>({ … }) }
  // catch (error) { return handleErrorResponse(error) }
  //
  // handleErrorResponse maps a DataSourceError to a GraphQLError with a code
  // and HTTP status, so adapter failures (e.g. PERMISSION_DENIED) reach the
  // client as explicit GraphQL errors instead of being masked to a generic
  // "Unexpected error." by Yoga's maskedErrors.
  const tryCatchStatement = ts.factory.createTryStatement(
    ts.factory.createBlock([returnStatement], true),
    ts.factory.createCatchClause(
      ts.factory.createVariableDeclaration(id("error")),
      ts.factory.createBlock(
        [
          ts.factory.createReturnStatement(
            ts.factory.createCallExpression(
              id("handleErrorResponse"),
              undefined,
              [id("error")]
            )
          ),
        ],
        true
      )
    ),
    undefined
  )

  return arrowFunction(
    [
      parameter("_parent"),
      parameter("args"),
      parameter("context"),
      parameter("info"),
    ],
    ts.factory.createBlock([readStrategyStatement, tryCatchStatement], true),
    { async: true }
  )
}

function createQueryField(
  queryName: string,
  nodeInterfaceName: string
): ts.PropertyAssignment {
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
      property("resolve", createResolver(nodeInterfaceName)),
    ])
  )
}

function generateQueryFields({
  queryName,
  nodeInterfaceName,
}: {
  queryName: string
  nodeInterfaceName: string
}): ts.Node[] {
  return [
    builderCall("queryFields", [
      fieldsFunction([createQueryField(queryName, nodeInterfaceName)]),
    ]),
  ]
}
