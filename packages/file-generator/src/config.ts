import ts from "typescript"

import {
  asConst,
  exportedConstStatement,
  objectLiteral,
  property,
  stringLiteral,
} from "./ast-builders"

export function generateConfig({
  catalog,
  schema,
  tableName,
  queryName,
  mutationName,
}: {
  catalog: string
  schema: string
  tableName: string
  queryName: string
  mutationName?: string[]
}) {
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
