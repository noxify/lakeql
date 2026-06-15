/**
 * Minimal AST builder utilities for the mutation schema generator.
 * Mirrors the pattern from @lakeql/file-generator/ast-builders.
 */
import ts from "typescript"

const { factory } = ts

function toIdentifier(name: string) {
  return factory.createIdentifier(name)
}

export function id(name: string): ts.Identifier {
  return toIdentifier(name)
}

export function stringLiteral(value: string): ts.StringLiteral {
  return factory.createStringLiteral(value)
}

export function property(
  name: string,
  initializer: ts.Expression
): ts.PropertyAssignment {
  return factory.createPropertyAssignment(toIdentifier(name), initializer)
}

export function objectLiteral(
  properties: ts.ObjectLiteralElementLike[],
  multiline = true
): ts.ObjectLiteralExpression {
  return factory.createObjectLiteralExpression(properties, multiline)
}

export function bool(value: boolean): ts.Expression {
  return value ? factory.createTrue() : factory.createFalse()
}

export function parameter(name: string): ts.ParameterDeclaration {
  return factory.createParameterDeclaration(
    undefined,
    undefined,
    toIdentifier(name)
  )
}

export function arrowFunction(
  parameters: (string | ts.ParameterDeclaration)[],
  body: ts.ConciseBody,
  options?: { async?: boolean }
): ts.ArrowFunction {
  return factory.createArrowFunction(
    options?.async
      ? [factory.createToken(ts.SyntaxKind.AsyncKeyword)]
      : undefined,
    undefined,
    parameters.map((param) =>
      typeof param === "string" ? parameter(param) : param
    ),
    undefined,
    factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    body
  )
}

export function parenthesized(
  expression: ts.Expression
): ts.ParenthesizedExpression {
  return factory.createParenthesizedExpression(expression)
}

export function fieldsFunction(
  properties: ts.ObjectLiteralElementLike[],
  multiline = true
): ts.ArrowFunction {
  return arrowFunction(
    ["t"],
    parenthesized(objectLiteral(properties, multiline))
  )
}

export function access(
  target: ts.Expression | string,
  propertyName: string
): ts.PropertyAccessExpression {
  return factory.createPropertyAccessExpression(
    typeof target === "string" ? toIdentifier(target) : target,
    toIdentifier(propertyName)
  )
}

export function call(
  expression: ts.Expression,
  args: ts.Expression[] = [],
  typeArguments?: ts.TypeNode[]
): ts.CallExpression {
  return factory.createCallExpression(expression, typeArguments, args)
}

export function methodCall(
  target: ts.Expression | string,
  methodName: string,
  args: ts.Expression[] = [],
  typeArguments?: ts.TypeNode[]
): ts.CallExpression {
  return call(access(target, methodName), args, typeArguments)
}

export function builderCall(
  methodName: string,
  args: ts.Expression[] = [],
  typeArguments?: ts.TypeNode[]
): ts.CallExpression {
  return methodCall("builder", methodName, args, typeArguments)
}

export function constStatement(
  name: string,
  initializer: ts.Expression
): ts.VariableStatement {
  return factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [
        factory.createVariableDeclaration(
          toIdentifier(name),
          undefined,
          undefined,
          initializer
        ),
      ],
      ts.NodeFlags.Const
    )
  )
}

export function importNames(
  moduleName: string,
  names: string[],
  options?: { typeOnly?: boolean }
): ts.ImportDeclaration {
  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      options?.typeOnly ?? false,
      undefined,
      factory.createNamedImports(
        names.map((name) =>
          factory.createImportSpecifier(false, undefined, toIdentifier(name))
        )
      )
    ),
    stringLiteral(moduleName)
  )
}

export function importDefault(
  moduleName: string,
  defaultName: string,
  options?: { typeOnly?: boolean }
): ts.ImportDeclaration {
  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      options?.typeOnly ?? false,
      toIdentifier(defaultName),
      // oxlint-disable-next-line unicorn/no-useless-undefined -- required positional arg for TS factory
      undefined
    ),
    stringLiteral(moduleName)
  )
}
