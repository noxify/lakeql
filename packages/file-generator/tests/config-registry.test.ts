import type {
  Identifier,
  ImportDeclaration,
  VariableStatement,
} from "typescript"
import ts from "typescript"
import { describe, expect, test } from "vitest"

import { generateConfigReqistry } from "../src/config-registry"

describe("Config Registry Generator", () => {
  test("generates import declarations for config paths", () => {
    const configPaths = ["path/to/config1", "path/to/config2"]
    const result = generateConfigReqistry({ configPaths })

    // Check if we have the correct number of nodes
    expect(result).toHaveLength(7)

    // Check if the first two nodes are import declarations
    expect(ts.isImportDeclaration(result[0] as ImportDeclaration)).toBeTruthy()
    expect(ts.isImportDeclaration(result[1] as ImportDeclaration)).toBeTruthy()

    // Check import paths
    const importPath1 = (result[0] as ts.ImportDeclaration).moduleSpecifier
    const importPath2 = (result[1] as ts.ImportDeclaration).moduleSpecifier

    expect(
      ts.isStringLiteral(importPath1) && ts.isStringLiteral(importPath2)
    ).toBeTruthy()
  })

  test("generates correct import paths", () => {
    const configPaths = ["path/to/config1", "path/to/config2"]
    const result = generateConfigReqistry({ configPaths })

    const importPath1 = (result[0] as ts.ImportDeclaration).moduleSpecifier
    const importPath2 = (result[1] as ts.ImportDeclaration).moduleSpecifier

    expect((importPath1 as ts.StringLiteral).text).toBe("./path/to/config1")
    expect((importPath2 as ts.StringLiteral).text).toBe("./path/to/config2")
  })

  test("generates allConfigs variable declaration", () => {
    const configPaths = ["path/to/config1", "path/to/config2"]
    const result = generateConfigReqistry({ configPaths })

    // Check if the third node is a variable statement (allConfigs)
    const allConfigsNode = result.at(2)
    expect(
      ts.isVariableStatement(allConfigsNode as VariableStatement)
    ).toBeTruthy()

    // Check if it has the export modifier
    const { modifiers } = allConfigsNode as ts.VariableStatement
    const [firstModifier] = modifiers ?? []
    expect(firstModifier?.kind).toBe(ts.SyntaxKind.ExportKeyword)

    // Check variable name
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const declaration = (allConfigsNode as ts.VariableStatement).declarationList
      .declarations[0]!
    expect(ts.isIdentifier(declaration.name)).toBeTruthy()
    expect((declaration.name as Identifier).text).toBe("allConfigs")
  })

  test("generates type aliases for catalogs, schemas, and tables", () => {
    const configPaths = ["path/to/config"]
    const result = generateConfigReqistry({ configPaths })

    // Check type aliases
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-non-null-assertion
    const typeAliases = result.filter((node) =>
      ts.isTypeAliasDeclaration(node)
    )!
    expect(typeAliases).toHaveLength(4)

    // Check type alias names
    expect(typeAliases[0]?.name.text).toBe("AvailableCatalogs")
    expect(typeAliases[1]?.name.text).toBe("AvailableSchemas")
    expect(typeAliases[2]?.name.text).toBe("AvailableTables")
  })

  test("generates TablesForCatalogAndSchema type with type parameters", () => {
    const configPaths = ["path/to/config"]
    const result = generateConfigReqistry({ configPaths })

    // Find the TablesForCatalogAndSchema type
    const tablesTypeNode = result.find(
      (node) =>
        ts.isTypeAliasDeclaration(node) &&
        node.name.text === "TablesForCatalogAndSchema"
    ) as ts.TypeAliasDeclaration

    expect(tablesTypeNode).toBeDefined()

    // Check type parameters
    expect(tablesTypeNode.typeParameters?.length).toBe(2)
    expect(tablesTypeNode.typeParameters?.[0]?.name.text).toBe("C")
    expect(tablesTypeNode.typeParameters?.[1]?.name.text).toBe("S")
  })

  test("handles empty config paths array", () => {
    const configPaths: string[] = []
    const result = generateConfigReqistry({ configPaths })

    // Should still generate the structure but with no imports
    expect(result).toHaveLength(5)

    // Check if the first node is the allConfigs variable
    expect(ts.isVariableStatement(result[0] as VariableStatement)).toBeTruthy()

    // Check if allConfigs is an empty array
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const declaration = (result[0] as ts.VariableStatement).declarationList
      .declarations[0]!
    const { initializer } = declaration
    expect(initializer).toBeDefined()

    // Verify it's an AsExpression with empty array
    const isAsExpr = initializer && ts.isAsExpression(initializer)
    expect(isAsExpr).toBeTruthy()

    if (isAsExpr) {
      const arrayLiteral = (initializer as ts.AsExpression).expression
      // oxlint-disable-next-line vitest/no-conditional-expect
      expect(
        ts.isArrayLiteralExpression(arrayLiteral) &&
          (arrayLiteral as ts.ArrayLiteralExpression).elements.length === 0
      ).toBeTruthy()
    }
  })
})
