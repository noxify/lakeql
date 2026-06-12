import ts from "typescript"

import {
  asConst,
  exportedConstStatement,
  objectLiteral,
  property,
  stringLiteral,
} from "./ast-builders"

/**
 * Parameters for generateConfig.
 */
export interface GenerateConfigProps {
  /** The Hive catalog name. */
  catalog: string
  /** The Hive schema name. */
  schema: string
  /** The Hive table name. */
  tableName: string
  /** The GraphQL query name for this table. */
  queryName: string
  /** Optional mutation names for this table endpoint. */
  mutationName?: string[]
}

/**
 * Generates config.ts AST nodes for a table endpoint.
 */
export function generateConfig({
  catalog,
  schema,
  tableName,
  queryName,
  mutationName,
}: GenerateConfigProps) {
  /**
   * Definition generated via https://ts-ast-viewer.com/
   */

  const hiveConfig = exportedConstStatement(
    "hiveConfig",
    asConst(
      objectLiteral([
        property("catalog", stringLiteral(catalog)),
        property("schema", stringLiteral(schema)),
        property("tableName", stringLiteral(tableName)),
      ])
    )
  )

  const docsConfig = exportedConstStatement(
    "docsConfig",
    objectLiteral([
      property("query", ts.factory.createTrue()),
      property(
        "mutation",
        mutationName ? ts.factory.createTrue() : ts.factory.createFalse()
      ),
      property("queryName", stringLiteral(queryName)),
      property(
        "mutationName",
        mutationName
          ? ts.factory.createArrayLiteralExpression(
              mutationName.map((name) => stringLiteral(name)),
              false
            )
          : ts.factory.createNull()
      ),
    ])
  )

  // Return the nodes directly - the generateCode function will handle formatting
  return [hiveConfig, docsConfig]
}
