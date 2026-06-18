import ts from "typescript"
import { describe, expect, test } from "vitest"

import {
  access,
  arrowFunction,
  arrayLiteral,
  asConst,
  bool,
  builderCall,
  builderInputRef,
  builderObjectRef,
  call,
  constStatement,
  exportedConstStatement,
  exportedInterface,
  expressionStatement,
  fieldsFunction,
  id,
  implement,
  importDefault,
  importDefaultAndNames,
  importNames,
  methodCall,
  nullLiteral,
  objectLiteral,
  parameter,
  parenthesized,
  property,
  propertySignature,
  shorthand,
  stringLiteral,
  tArg,
  tExpose,
  tField,
  typeRef,
} from "../src/ast-builders"

describe("ast-builders", () => {
  describe("Literals & identifiers", () => {
    test("id creates an identifier node", () => {
      const node = id("myVar")
      expect(ts.isIdentifier(node)).toBeTruthy()
      expect(node.text).toBe("myVar")
    })

    test("stringLiteral creates a string literal node", () => {
      const node = stringLiteral("hello")
      expect(ts.isStringLiteral(node)).toBeTruthy()
      expect(node.text).toBe("hello")
    })

    test("bool(true) creates a TrueKeyword", () => {
      const node = bool(true)
      expect(node.kind).toBe(ts.SyntaxKind.TrueKeyword)
    })

    test("bool(false) creates a FalseKeyword", () => {
      const node = bool(false)
      expect(node.kind).toBe(ts.SyntaxKind.FalseKeyword)
    })

    test("nullLiteral creates a NullLiteral node", () => {
      const node = nullLiteral()
      expect(node.kind).toBe(ts.SyntaxKind.NullKeyword)
    })
  })

  describe("Type nodes", () => {
    test("typeRef creates a type reference node without type arguments", () => {
      const node = typeRef("MyType")
      expect(ts.isTypeReferenceNode(node)).toBeTruthy()
      expect((node.typeName as ts.Identifier).text).toBe("MyType")
      expect(node.typeArguments).toBeUndefined()
    })

    test("typeRef creates a type reference node with type arguments", () => {
      const node = typeRef("Array", [typeRef("string")])
      expect(ts.isTypeReferenceNode(node)).toBeTruthy()
      expect((node.typeName as ts.Identifier).text).toBe("Array")
      expect(node.typeArguments).toHaveLength(1)
    })
  })

  describe("Object-related", () => {
    test("property creates a property assignment", () => {
      const node = property("key", stringLiteral("value"))
      expect(ts.isPropertyAssignment(node)).toBeTruthy()
      expect((node.name as ts.Identifier).text).toBe("key")
      expect(ts.isStringLiteral(node.initializer)).toBeTruthy()
      expect((node.initializer as ts.StringLiteral).text).toBe("value")
    })
    test("property throws for non-identifier names", () => {
      expect(() => property("customer-id", stringLiteral("value"))).toThrow(
        'Invalid identifier name: "customer-id"'
      )
    })

    test("shorthand creates a shorthand property assignment", () => {
      const node = shorthand("name")
      expect(ts.isShorthandPropertyAssignment(node)).toBeTruthy()
      expect(node.name.text).toBe("name")
    })

    test("objectLiteral creates an object literal with multiline true by default", () => {
      const props = [property("a", stringLiteral("1"))]
      const node = objectLiteral(props)
      expect(ts.isObjectLiteralExpression(node)).toBeTruthy()
      expect(node.properties).toHaveLength(1)
      // multiLine is an internal property, access via cast
      expect((node as unknown as { multiLine: boolean }).multiLine).toBeTruthy()
    })

    test("objectLiteral creates an object literal with multiline false", () => {
      const props = [property("a", stringLiteral("1"))]
      const node = objectLiteral(props, false)
      expect(ts.isObjectLiteralExpression(node)).toBeTruthy()
      expect((node as unknown as { multiLine: boolean }).multiLine).toBeFalsy()
    })

    test("arrayLiteral creates an array literal expression", () => {
      const elements = [stringLiteral("a"), stringLiteral("b")]
      const node = arrayLiteral(elements)
      expect(ts.isArrayLiteralExpression(node)).toBeTruthy()
      expect(node.elements).toHaveLength(2)
    })
  })

  describe("Expressions", () => {
    test("asConst wraps expression in an as-const assertion", () => {
      const expr = arrayLiteral([])
      const node = asConst(expr)
      expect(ts.isAsExpression(node)).toBeTruthy()
      expect(ts.isArrayLiteralExpression(node.expression)).toBeTruthy()
      expect(ts.isTypeReferenceNode(node.type)).toBeTruthy()
      expect(
        ((node.type as ts.TypeReferenceNode).typeName as ts.Identifier).text
      ).toBe("const")
    })

    test("access with string target creates property access expression", () => {
      const node = access("obj", "prop")
      expect(ts.isPropertyAccessExpression(node)).toBeTruthy()
      expect(ts.isIdentifier(node.expression)).toBeTruthy()
      expect((node.expression as ts.Identifier).text).toBe("obj")
      expect(node.name.text).toBe("prop")
    })

    test("access with Expression target creates property access expression", () => {
      const target = id("myObj")
      const node = access(target, "method")
      expect(ts.isPropertyAccessExpression(node)).toBeTruthy()
      expect(ts.isIdentifier(node.expression)).toBeTruthy()
      expect((node.expression as ts.Identifier).text).toBe("myObj")
      expect(node.name.text).toBe("method")
    })

    test("call creates a call expression", () => {
      const node = call(id("fn"), [stringLiteral("arg")])
      expect(ts.isCallExpression(node)).toBeTruthy()
      expect(ts.isIdentifier(node.expression)).toBeTruthy()
      expect((node.expression as ts.Identifier).text).toBe("fn")
      expect(node.arguments).toHaveLength(1)
    })

    test("call with type arguments", () => {
      const node = call(id("fn"), [], [typeRef("T")])
      expect(ts.isCallExpression(node)).toBeTruthy()
      expect(node.typeArguments).toHaveLength(1)
    })

    test("methodCall creates a call on a property access", () => {
      const node = methodCall("obj", "doSomething", [stringLiteral("x")])
      expect(ts.isCallExpression(node)).toBeTruthy()
      expect(ts.isPropertyAccessExpression(node.expression)).toBeTruthy()
      const { expression: accessExpr } = node
      expect((accessExpr as ts.PropertyAccessExpression).name.text).toBe(
        "doSomething"
      )
    })

    test("methodCall targets correct object", () => {
      const node = methodCall("obj", "doSomething", [stringLiteral("x")])
      const accessExpr = node.expression as ts.PropertyAccessExpression
      expect((accessExpr.expression as ts.Identifier).text).toBe("obj")
      expect(node.arguments).toHaveLength(1)
    })

    test("parenthesized wraps expression in parentheses", () => {
      const expr = stringLiteral("inner")
      const node = parenthesized(expr)
      expect(ts.isParenthesizedExpression(node)).toBeTruthy()
      expect(ts.isStringLiteral(node.expression)).toBeTruthy()
    })
  })

  describe("Functions", () => {
    test("parameter creates a parameter declaration", () => {
      const node = parameter("arg")
      expect(node.kind).toBe(ts.SyntaxKind.Parameter)
      expect((node.name as ts.Identifier).text).toBe("arg")
    })

    test("arrowFunction with string parameters", () => {
      const node = arrowFunction(["a", "b"], stringLiteral("body"))
      expect(ts.isArrowFunction(node)).toBeTruthy()
      expect(node.parameters).toHaveLength(2)
      const firstParam = node.parameters[0] as ts.ParameterDeclaration
      const secondParam = node.parameters[1] as ts.ParameterDeclaration
      expect((firstParam.name as ts.Identifier).text).toBe("a")
      expect((secondParam.name as ts.Identifier).text).toBe("b")
    })

    test("arrowFunction with ParameterDeclaration params", () => {
      const params = [parameter("x")]
      const node = arrowFunction(params, stringLiteral("body"))
      expect(ts.isArrowFunction(node)).toBeTruthy()
      expect(node.parameters).toHaveLength(1)
      const firstParam = node.parameters[0] as ts.ParameterDeclaration
      expect((firstParam.name as ts.Identifier).text).toBe("x")
    })

    test("arrowFunction with async option", () => {
      const node = arrowFunction(["a"], stringLiteral("body"), { async: true })
      expect(ts.isArrowFunction(node)).toBeTruthy()
      const { modifiers } = node
      expect(modifiers).toBeDefined()
      expect(modifiers?.[0]?.kind).toBe(ts.SyntaxKind.AsyncKeyword)
    })

    test("fieldsFunction creates an arrow function with 't' parameter", () => {
      const props = [property("name", stringLiteral("value"))]
      const node = fieldsFunction(props)
      expect(ts.isArrowFunction(node)).toBeTruthy()
      expect(node.parameters).toHaveLength(1)
      const firstParam = node.parameters[0] as ts.ParameterDeclaration
      expect((firstParam.name as ts.Identifier).text).toBe("t")
    })

    test("fieldsFunction body is a parenthesized object literal", () => {
      const props = [property("name", stringLiteral("value"))]
      const node = fieldsFunction(props)
      expect(ts.isParenthesizedExpression(node.body)).toBeTruthy()
      const inner = (node.body as ts.ParenthesizedExpression).expression
      expect(ts.isObjectLiteralExpression(inner)).toBeTruthy()
    })
  })

  describe("Statements", () => {
    test("expressionStatement wraps an expression in a statement", () => {
      const expr = call(id("doStuff"), [])
      const node = expressionStatement(expr)
      expect(ts.isExpressionStatement(node)).toBeTruthy()
      expect(ts.isCallExpression(node.expression)).toBeTruthy()
    })

    test("constStatement creates a const variable declaration", () => {
      const node = constStatement("myConst", stringLiteral("val"))
      expect(ts.isVariableStatement(node)).toBeTruthy()
      // oxlint-disable-next-line no-bitwise
      expect(node.declarationList.flags & ts.NodeFlags.Const).toBeTruthy()
      const decl = node.declarationList
        .declarations[0] as ts.VariableDeclaration
      expect((decl.name as ts.Identifier).text).toBe("myConst")
      expect(ts.isStringLiteral(decl.initializer as ts.Node)).toBeTruthy()
    })

    test("constStatement has no export modifier", () => {
      const node = constStatement("myConst", stringLiteral("val"))
      expect(node.modifiers).toBeUndefined()
    })

    test("exportedConstStatement creates an exported const variable declaration", () => {
      const node = exportedConstStatement("exported", stringLiteral("val"))
      expect(ts.isVariableStatement(node)).toBeTruthy()
      // oxlint-disable-next-line no-bitwise
      expect(node.declarationList.flags & ts.NodeFlags.Const).toBeTruthy()
      const decl = node.declarationList
        .declarations[0] as ts.VariableDeclaration
      expect((decl.name as ts.Identifier).text).toBe("exported")
      expect(node.modifiers).toBeDefined()
    })

    test("exportedConstStatement has export modifier", () => {
      const node = exportedConstStatement("exported", stringLiteral("val"))
      expect(node.modifiers?.[0]?.kind).toBe(ts.SyntaxKind.ExportKeyword)
    })
  })

  describe("Builder helpers", () => {
    test("implement calls .implement on target", () => {
      const props = [property("key", stringLiteral("val"))]
      const node = implement("myTarget", props)
      expect(ts.isCallExpression(node)).toBeTruthy()
      const accessExpr = node.expression as ts.PropertyAccessExpression
      expect(ts.isPropertyAccessExpression(accessExpr)).toBeTruthy()
      expect((accessExpr.expression as ts.Identifier).text).toBe("myTarget")
      expect(accessExpr.name.text).toBe("implement")
    })

    test("implement passes object literal argument", () => {
      const props = [property("key", stringLiteral("val"))]
      const node = implement("myTarget", props)
      expect(node.arguments).toHaveLength(1)
      expect(
        ts.isObjectLiteralExpression(node.arguments[0] as ts.Node)
      ).toBeTruthy()
    })

    test("builderCall calls a method on 'builder'", () => {
      const node = builderCall("someMethod", [stringLiteral("arg")])
      expect(ts.isCallExpression(node)).toBeTruthy()
      const accessExpr = node.expression as ts.PropertyAccessExpression
      expect((accessExpr.expression as ts.Identifier).text).toBe("builder")
      expect(accessExpr.name.text).toBe("someMethod")
    })

    test("builderCall with type arguments", () => {
      const node = builderCall("ref", [], [typeRef("MyType")])
      expect(ts.isCallExpression(node)).toBeTruthy()
      expect(node.typeArguments).toHaveLength(1)
    })

    test("builderInputRef calls builder.inputRef with string arg", () => {
      const node = builderInputRef("InputName")
      expect(ts.isCallExpression(node)).toBeTruthy()
      const accessExpr = node.expression as ts.PropertyAccessExpression
      expect((accessExpr.expression as ts.Identifier).text).toBe("builder")
      expect(accessExpr.name.text).toBe("inputRef")
    })

    test("builderInputRef passes correct argument", () => {
      const node = builderInputRef("InputName")
      expect(node.arguments).toHaveLength(1)
      expect((node.arguments[0] as ts.StringLiteral).text).toBe("InputName")
    })

    test("builderObjectRef calls builder.objectRef with string arg", () => {
      const node = builderObjectRef("ObjName")
      expect(ts.isCallExpression(node)).toBeTruthy()
      const accessExpr = node.expression as ts.PropertyAccessExpression
      expect((accessExpr.expression as ts.Identifier).text).toBe("builder")
      expect(accessExpr.name.text).toBe("objectRef")
    })

    test("builderObjectRef passes correct argument", () => {
      const node = builderObjectRef("ObjName")
      expect(node.arguments).toHaveLength(1)
      expect((node.arguments[0] as ts.StringLiteral).text).toBe("ObjName")
    })

    test("builderObjectRef with type arguments", () => {
      const node = builderObjectRef("ObjName", [typeRef("T")])
      expect(ts.isCallExpression(node)).toBeTruthy()
      expect(node.typeArguments).toHaveLength(1)
    })

    test("tField calls t.field with object literal", () => {
      const props = [property("type", stringLiteral("String"))]
      const node = tField(props)
      expect(ts.isCallExpression(node)).toBeTruthy()
      const accessExpr = node.expression as ts.PropertyAccessExpression
      expect((accessExpr.expression as ts.Identifier).text).toBe("t")
      expect(accessExpr.name.text).toBe("field")
    })

    test("tField passes object literal argument", () => {
      const props = [property("type", stringLiteral("String"))]
      const node = tField(props)
      expect(node.arguments).toHaveLength(1)
      expect(
        ts.isObjectLiteralExpression(node.arguments[0] as ts.Node)
      ).toBeTruthy()
    })

    test("tArg calls t.arg with object literal", () => {
      const props = [property("type", stringLiteral("Int"))]
      const node = tArg(props)
      expect(ts.isCallExpression(node)).toBeTruthy()
      const accessExpr = node.expression as ts.PropertyAccessExpression
      expect((accessExpr.expression as ts.Identifier).text).toBe("t")
      expect(accessExpr.name.text).toBe("arg")
    })

    test("tExpose calls t.expose with correct access", () => {
      const props = [property("type", stringLiteral("Boolean"))]
      const node = tExpose("isActive", props)
      expect(ts.isCallExpression(node)).toBeTruthy()
      const accessExpr = node.expression as ts.PropertyAccessExpression
      expect((accessExpr.expression as ts.Identifier).text).toBe("t")
      expect(accessExpr.name.text).toBe("expose")
    })

    test("tExpose passes name and object literal arguments", () => {
      const props = [property("type", stringLiteral("Boolean"))]
      const node = tExpose("isActive", props)
      expect(node.arguments).toHaveLength(2)
      expect((node.arguments[0] as ts.StringLiteral).text).toBe("isActive")
      expect(
        ts.isObjectLiteralExpression(node.arguments[1] as ts.Node)
      ).toBeTruthy()
    })
  })

  describe("Types/Interfaces", () => {
    test("propertySignature creates a required property signature", () => {
      const node = propertySignature("name", "string")
      expect(ts.isPropertySignature(node)).toBeTruthy()
      expect((node.name as ts.Identifier).text).toBe("name")
      expect(node.questionToken).toBeUndefined()
      expect(ts.isTypeReferenceNode(node.type as ts.Node)).toBeTruthy()
    })
    test("propertySignature throws for non-identifier names", () => {
      expect(() => propertySignature("order-total", "string")).toThrow(
        'Invalid identifier name: "order-total"'
      )
    })

    test("propertySignature creates an optional property signature", () => {
      const node = propertySignature("age", "number", { optional: true })
      expect(ts.isPropertySignature(node)).toBeTruthy()
      expect((node.name as ts.Identifier).text).toBe("age")
      expect(node.questionToken).toBeDefined()
      expect(node.questionToken?.kind).toBe(ts.SyntaxKind.QuestionToken)
    })

    test("propertySignature accepts a TypeNode as type", () => {
      const typeNode = typeRef("Array", [typeRef("string")])
      const node = propertySignature("items", typeNode)
      expect(ts.isPropertySignature(node)).toBeTruthy()
      expect(ts.isTypeReferenceNode(node.type as ts.Node)).toBeTruthy()
      expect((node.type as ts.TypeReferenceNode).typeArguments).toHaveLength(1)
    })

    test("exportedInterface creates an exported interface declaration", () => {
      const members = [propertySignature("id", "string")]
      const node = exportedInterface("MyInterface", members)
      expect(ts.isInterfaceDeclaration(node)).toBeTruthy()
      expect(node.name.text).toBe("MyInterface")
      expect(node.members).toHaveLength(1)
      expect(node.modifiers).toBeDefined()
      expect(node.modifiers?.[0]?.kind).toBe(ts.SyntaxKind.ExportKeyword)
    })
  })

  describe("Imports", () => {
    test("importNames creates a named import declaration", () => {
      const node = importNames("my-module", ["foo", "bar"])
      expect(ts.isImportDeclaration(node)).toBeTruthy()
      expect((node.moduleSpecifier as ts.StringLiteral).text).toBe("my-module")
      const clause = node.importClause
      expect(clause).toBeDefined()
      expect(clause?.isTypeOnly).toBeFalsy()
    })

    test("importNames has correct named bindings", () => {
      const node = importNames("my-module", ["foo", "bar"])
      const clause = node.importClause
      const namedBindings = clause?.namedBindings as ts.NamedImports
      expect(ts.isNamedImports(namedBindings)).toBeTruthy()
      expect(namedBindings.elements).toHaveLength(2)
      const firstElement = namedBindings.elements[0] as ts.ImportSpecifier
      const secondElement = namedBindings.elements[1] as ts.ImportSpecifier
      expect(firstElement.name.text).toBe("foo")
      expect(secondElement.name.text).toBe("bar")
    })

    test("importNames with typeOnly creates a type-only import", () => {
      const node = importNames("types-module", ["MyType"], { typeOnly: true })
      expect(ts.isImportDeclaration(node)).toBeTruthy()
      const clause = node.importClause
      expect(clause).toBeDefined()
      expect(clause?.isTypeOnly).toBeTruthy()
    })

    test("importDefault creates a default import declaration", () => {
      const node = importDefault("my-module", "myDefault")
      expect(ts.isImportDeclaration(node)).toBeTruthy()
      expect((node.moduleSpecifier as ts.StringLiteral).text).toBe("my-module")
      const clause = node.importClause
      expect(clause).toBeDefined()
      expect(clause?.isTypeOnly).toBeFalsy()
    })

    test("importDefault has correct default binding", () => {
      const node = importDefault("my-module", "myDefault")
      const clause = node.importClause
      expect(ts.isIdentifier(clause?.name as ts.Node)).toBeTruthy()
      expect(clause?.name?.text).toBe("myDefault")
      expect(clause?.namedBindings).toBeUndefined()
    })

    test("importDefault with typeOnly creates a type-only default import", () => {
      const node = importDefault("types-module", "MyType", { typeOnly: true })
      expect(ts.isImportDeclaration(node)).toBeTruthy()
      const clause = node.importClause
      expect(clause).toBeDefined()
      expect(clause?.isTypeOnly).toBeTruthy()
    })

    test("importDefaultAndNames creates an import with default and named bindings", () => {
      const node = importDefaultAndNames("my-module", "def", ["a", "b"])
      expect(ts.isImportDeclaration(node)).toBeTruthy()
      expect((node.moduleSpecifier as ts.StringLiteral).text).toBe("my-module")
      const clause = node.importClause
      expect(clause).toBeDefined()
      expect(clause?.isTypeOnly).toBeFalsy()
      expect(clause?.name?.text).toBe("def")
    })

    test("importDefaultAndNames has correct named bindings", () => {
      const node = importDefaultAndNames("my-module", "def", ["a", "b"])
      const clause = node.importClause
      const namedBindings = clause?.namedBindings as ts.NamedImports
      expect(ts.isNamedImports(namedBindings)).toBeTruthy()
      expect(namedBindings.elements).toHaveLength(2)
      const firstElement = namedBindings.elements[0] as ts.ImportSpecifier
      const secondElement = namedBindings.elements[1] as ts.ImportSpecifier
      expect(firstElement.name.text).toBe("a")
      expect(secondElement.name.text).toBe("b")
    })

    test("importDefaultAndNames without default name", () => {
      const node = importDefaultAndNames("my-module", undefined, ["x"])
      expect(ts.isImportDeclaration(node)).toBeTruthy()
      const clause = node.importClause
      expect(clause).toBeDefined()
      expect(clause?.name).toBeUndefined()
      const namedBindings = clause?.namedBindings as ts.NamedImports
      expect(namedBindings.elements).toHaveLength(1)
    })

    test("importDefaultAndNames without default has correct element", () => {
      const node = importDefaultAndNames("my-module", undefined, ["x"])
      const clause = node.importClause
      const namedBindings = clause?.namedBindings as ts.NamedImports
      const firstElement = namedBindings.elements[0] as ts.ImportSpecifier
      expect(firstElement.name.text).toBe("x")
    })

    test("importDefaultAndNames with typeOnly", () => {
      const node = importDefaultAndNames("mod", "Def", ["Named"], {
        typeOnly: true,
      })
      expect(ts.isImportDeclaration(node)).toBeTruthy()
      const clause = node.importClause
      expect(clause).toBeDefined()
      expect(clause?.isTypeOnly).toBeTruthy()
    })
  })
})
