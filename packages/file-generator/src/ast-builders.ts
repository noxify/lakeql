import ts from "typescript"

const { factory } = ts

type TypeLike = string | ts.TypeNode
const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/u

function toIdentifier(name: string) {
  if (!identifierPattern.test(name)) {
    throw new Error(`Invalid identifier name: "${name}"`)
  }

  return factory.createIdentifier(name)
}

function toTypeNode(type: TypeLike) {
  return typeof type === "string"
    ? factory.createTypeReferenceNode(toIdentifier(type))
    : type
}

export function id(name: string): ts.Identifier {
  return toIdentifier(name)
}

export function stringLiteral(value: string): ts.StringLiteral {
  return factory.createStringLiteral(value)
}

export function typeRef(
  name: string,
  typeArguments?: ts.TypeNode[]
): ts.TypeReferenceNode {
  return factory.createTypeReferenceNode(toIdentifier(name), typeArguments)
}

export function property(
  name: string,
  initializer: ts.Expression
): ts.PropertyAssignment {
  return factory.createPropertyAssignment(toIdentifier(name), initializer)
}

export function shorthand(name: string): ts.ShorthandPropertyAssignment {
  return factory.createShorthandPropertyAssignment(toIdentifier(name))
}

export function objectLiteral(
  properties: ts.ObjectLiteralElementLike[],
  multiline = true
): ts.ObjectLiteralExpression {
  return factory.createObjectLiteralExpression(properties, multiline)
}

export function arrayLiteral(
  elements: ts.Expression[],
  multiline = false
): ts.ArrayLiteralExpression {
  return factory.createArrayLiteralExpression(elements, multiline)
}

export function asConst(expression: ts.Expression): ts.AsExpression {
  return factory.createAsExpression(expression, typeRef("const"))
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

export function bool(value: boolean): ts.Expression {
  return value ? factory.createTrue() : factory.createFalse()
}

export function nullLiteral(): ts.NullLiteral {
  return factory.createNull()
}

export function expressionStatement(
  expression: ts.Expression
): ts.ExpressionStatement {
  return factory.createExpressionStatement(expression)
}

export function implement(
  target: ts.Expression | string,
  properties: ts.ObjectLiteralElementLike[]
): ts.CallExpression {
  return methodCall(target, "implement", [objectLiteral(properties)])
}

export function builderCall(
  methodName: string,
  args: ts.Expression[] = [],
  typeArguments?: ts.TypeNode[]
): ts.CallExpression {
  return methodCall("builder", methodName, args, typeArguments)
}

export function builderInputRef(name: string): ts.CallExpression {
  return builderCall("inputRef", [stringLiteral(name)])
}

export function builderObjectRef(
  name: string,
  typeArguments?: ts.TypeNode[]
): ts.CallExpression {
  return builderCall("objectRef", [stringLiteral(name)], typeArguments)
}

export function tField(
  properties: ts.ObjectLiteralElementLike[]
): ts.CallExpression {
  return methodCall("t", "field", [objectLiteral(properties, false)])
}

export function tArg(
  properties: ts.ObjectLiteralElementLike[]
): ts.CallExpression {
  return methodCall("t", "arg", [objectLiteral(properties, false)])
}

export function tExpose(
  name: string,
  properties: ts.ObjectLiteralElementLike[]
): ts.CallExpression {
  return methodCall("t", "expose", [
    stringLiteral(name),
    objectLiteral(properties, false),
  ])
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

export function exportedConstStatement(
  name: string,
  initializer: ts.Expression
): ts.VariableStatement {
  return factory.createVariableStatement(
    [factory.createToken(ts.SyntaxKind.ExportKeyword)],
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

export function propertySignature(
  name: string,
  type: TypeLike,
  options?: { optional?: boolean }
): ts.PropertySignature {
  return factory.createPropertySignature(
    undefined,
    toIdentifier(name),
    options?.optional
      ? factory.createToken(ts.SyntaxKind.QuestionToken)
      : undefined,
    toTypeNode(type)
  )
}

export function exportedInterface(
  name: string,
  members: ts.TypeElement[]
): ts.InterfaceDeclaration {
  return factory.createInterfaceDeclaration(
    [factory.createToken(ts.SyntaxKind.ExportKeyword)],
    toIdentifier(name),
    undefined,
    undefined,
    members
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
      // oxlint-disable-next-line unicorn/no-useless-undefined
      undefined
    ),
    stringLiteral(moduleName)
  )
}

export function importDefaultAndNames(
  moduleName: string,
  defaultName: string | undefined,
  names: string[],
  options?: { typeOnly?: boolean }
): ts.ImportDeclaration {
  return factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      options?.typeOnly ?? false,
      defaultName ? toIdentifier(defaultName) : undefined,
      factory.createNamedImports(
        names.map((name) =>
          factory.createImportSpecifier(false, undefined, toIdentifier(name))
        )
      )
    ),
    stringLiteral(moduleName)
  )
}
