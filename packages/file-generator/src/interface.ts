import type { ModelResponse } from "@lakeql/schema-generator/graphql-schema"
import ts from "typescript"

import { exportedInterface, propertySignature, typeRef } from "./ast-builders"

export function generateInterface(models: Record<string, ModelResponse>) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const rootModel = Object.values(models).find((model) => model.root === true)!

  /**
   * Definition generated via https://ts-ast-viewer.com/
   */
  const declarations = Object.values(models).flatMap((modelDefinition) => [
    exportedInterface(
      modelDefinition.interfaceName,
      Object.values(modelDefinition.fields).map((fieldDefinition) =>
        propertySignature(
          fieldDefinition.name,
          typeRef(
            fieldDefinition.interfaceName ?? fieldDefinition.interfaceType
          ),
          { optional: true }
        )
      )
    ),
    ts.factory.createIdentifier("\n"),
  ])

  return [...declarations, ...generateTableDefinition(rootModel)]
}

export function generateTableDefinition(model: ModelResponse) {
  /**
   * Definition generated via https://ts-ast-viewer.com/
   */
  return [
    exportedInterface(
      "TableDefinition",
      Object.values(model.fields)
        .filter((field) => field.filter === true)
        .map((fieldDefinition) =>
          propertySignature(
            fieldDefinition.name,
            typeRef(
              fieldDefinition.interfaceName ?? fieldDefinition.interfaceType
            )
          )
        )
    ),
    ts.factory.createIdentifier("\n"),
  ]
}
