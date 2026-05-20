import { parseColumns } from "@lakeql/column-parser"
import formatCode from "@lakeql/helpers/format-code"
import { generateModel } from "@lakeql/schema-generator/graphql-schema"
import { generateJsonSchema } from "@lakeql/schema-generator/json-schema"
import { describe, expect, test } from "vitest"

import { generateCode } from "../src"
import { generateInterface } from "../src/interface"

describe("interface file generator", () => {
  test("simple interface", async () => {
    const parsedColumns = parseColumns([
      { description: "", extra: "", name: "stringField", type: "varchar" },
      {
        description: "",
        extra: "",
        name: "integerField",
        type: "integer",
      },
      {
        description: "",
        extra: "",
        name: "booleanField",
        type: "boolean",
      },
      {
        description: "",
        extra: "",
        name: "arrayField",
        type: "array(varchar)",
      },
      {
        description: "",
        extra: "",
        name: "timestampField",
        type: "timestamp(3)",
      },
      {
        description: "",
        extra: "",
        name: "bigintField",
        type: "bigint",
      },
    ])

    const jsonSchema = generateJsonSchema(parsedColumns)

    const models = generateModel({
      isRoot: true,
      models: {},
      name: "Simple",
      source: jsonSchema,
    })

    const generatedFactoryCode = generateInterface(models)

    const generatedCodeFromFactory = await generateCode({
      fileName: "vitest_interface.ts",
      nodes: generatedFactoryCode,
    })

    const expectedCode = await formatCode(`
      export interface SimpleInterface {
        stringField?: string
        integerField?: number
        booleanField?: boolean
        arrayField?: string[]
        timestampField?: Date
        bigintField?: number
      }

      export interface TableDefinition {
       stringField: string
       integerField: number
       booleanField: boolean
       timestampField: Date
       bigintField: number
      }
    `)

    expect(generatedCodeFromFactory.text).toBe(expectedCode)
    expect(generatedCodeFromFactory.fileName).toBe("vitest_interface.ts")
  })

  test("interface w/ object", async () => {
    const parsedColumns = parseColumns([
      { description: "", extra: "", name: "stringField", type: "varchar" },
      {
        description: "",
        extra: "",
        name: "objField",
        type: "row(sub1 varchar, sub2 integer, sub3 boolean)",
      },
    ])

    const jsonSchema = generateJsonSchema(parsedColumns)

    const models = generateModel({
      isRoot: true,
      models: {},
      name: "Object",
      source: jsonSchema,
    })

    const generatedFactoryCode = generateInterface(models)

    const generatedCodeFromFactory = await generateCode({
      fileName: "vitest_interface.ts",
      nodes: generatedFactoryCode,
    })

    const expectedCode = await formatCode(`
      export interface Object_ObjfieldInterface {
        sub1?: string
        sub2?: number
        sub3?: boolean
      }

      export interface ObjectInterface {
        stringField?: string
        objField?: Object_ObjfieldInterface
      }

      export interface TableDefinition {
       stringField: string
      }
    `)

    expect(generatedCodeFromFactory.text).toBe(expectedCode)
    expect(generatedCodeFromFactory.fileName).toBe("vitest_interface.ts")
  })

  test("interface w/ array of object", async () => {
    const parsedColumns = parseColumns([
      { description: "", extra: "", name: "stringField", type: "varchar" },
      {
        description: "",
        extra: "",
        name: "arrayField",
        type: "array(row(sub1 varchar, sub2 integer, sub3 boolean))",
      },
    ])

    const jsonSchema = generateJsonSchema(parsedColumns)

    const models = generateModel({
      isRoot: true,
      models: {},
      name: "ArrayObject",
      source: jsonSchema,
    })

    const generatedFactoryCode = generateInterface(models)

    const generatedCodeFromFactory = await generateCode({
      fileName: "vitest_interface.ts",
      nodes: generatedFactoryCode,
    })

    const expectedCode = await formatCode(`
      export interface ArrayObject_ArrayfieldInterface {
        sub1?: string
        sub2?: number
        sub3?: boolean
      }

      export interface ArrayObjectInterface {
        stringField?: string
        arrayField?: ArrayObject_ArrayfieldInterface[]
      }

      export interface TableDefinition {
       stringField: string
      }
    `)

    expect(generatedCodeFromFactory.text).toBe(expectedCode)
    expect(generatedCodeFromFactory.fileName).toBe("vitest_interface.ts")
  })
})
