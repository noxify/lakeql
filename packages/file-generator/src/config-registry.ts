import ts from "typescript"

/**
 * Parameters for generateConfigRegistry.
 */
export interface GenerateConfigRegistryProps {
  /** Relative paths to individual table config modules. */
  configPaths: string[]
}

/**
 * Generates the config registry aggregating all table configs.
 */
export function generateConfigRegistry({
  configPaths,
}: GenerateConfigRegistryProps) {
  const { factory } = ts
  return [
    ...configPaths.map((path, index) =>
      factory.createImportDeclaration(
        undefined,
        factory.createImportClause(
          false,
          undefined,
          factory.createNamedImports([
            factory.createImportSpecifier(
              false,
              factory.createIdentifier("sourceConfig"),
              factory.createIdentifier(`config_${index}`)
            ),
          ])
        ),
        factory.createStringLiteral(`./${path}`)
      )
    ),

    factory.createVariableStatement(
      [factory.createToken(ts.SyntaxKind.ExportKeyword)],
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            factory.createIdentifier("allConfigs"),
            undefined,
            undefined,
            factory.createAsExpression(
              factory.createArrayLiteralExpression(
                configPaths.map((_, index) =>
                  factory.createIdentifier(`config_${index}`)
                ),
                true
              ),
              factory.createTypeReferenceNode(factory.createIdentifier("const"))
            )
          ),
        ],
        ts.NodeFlags.Const
      )
    ),
    factory.createTypeAliasDeclaration(
      [factory.createToken(ts.SyntaxKind.ExportKeyword)],
      factory.createIdentifier("AvailableDataSources"),
      undefined,
      factory.createIndexedAccessTypeNode(
        factory.createIndexedAccessTypeNode(
          factory.createParenthesizedType(
            factory.createTypeQueryNode(factory.createIdentifier("allConfigs"))
          ),
          factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
        ),
        factory.createLiteralTypeNode(factory.createStringLiteral("dataSource"))
      )
    ),
    factory.createTypeAliasDeclaration(
      [factory.createToken(ts.SyntaxKind.ExportKeyword)],
      factory.createIdentifier("AvailableAdapters"),
      undefined,
      factory.createIndexedAccessTypeNode(
        factory.createIndexedAccessTypeNode(
          factory.createParenthesizedType(
            factory.createTypeQueryNode(factory.createIdentifier("allConfigs"))
          ),
          factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
        ),
        factory.createLiteralTypeNode(factory.createStringLiteral("adapter"))
      )
    ),
    factory.createTypeAliasDeclaration(
      [factory.createToken(ts.SyntaxKind.ExportKeyword)],
      factory.createIdentifier("AvailableTables"),
      undefined,
      factory.createIndexedAccessTypeNode(
        factory.createIndexedAccessTypeNode(
          factory.createParenthesizedType(
            factory.createTypeQueryNode(factory.createIdentifier("allConfigs"))
          ),
          factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
        ),
        factory.createLiteralTypeNode(factory.createStringLiteral("tableName"))
      )
    ),
    factory.createTypeAliasDeclaration(
      [factory.createToken(ts.SyntaxKind.ExportKeyword)],
      factory.createIdentifier("TablesForDataSource"),
      [
        factory.createTypeParameterDeclaration(
          undefined,
          factory.createIdentifier("DS"),
          factory.createTypeReferenceNode(
            factory.createIdentifier("AvailableDataSources")
          )
        ),
      ],
      factory.createIndexedAccessTypeNode(
        factory.createTypeReferenceNode(factory.createIdentifier("Extract"), [
          factory.createIndexedAccessTypeNode(
            factory.createParenthesizedType(
              factory.createTypeQueryNode(
                factory.createIdentifier("allConfigs")
              )
            ),
            factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
          ),
          factory.createTypeLiteralNode([
            factory.createPropertySignature(
              undefined,
              factory.createIdentifier("dataSource"),
              undefined,
              factory.createTypeReferenceNode(factory.createIdentifier("DS"))
            ),
          ]),
        ]),
        factory.createLiteralTypeNode(factory.createStringLiteral("tableName"))
      )
    ),
  ]
}
