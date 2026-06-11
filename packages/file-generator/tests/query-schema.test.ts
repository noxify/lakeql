import { parseColumns } from "@lakeql/column-parser"
import { generateModel } from "@lakeql/schema-generator/graphql-schema"
import { generateJsonSchema } from "@lakeql/schema-generator/json-schema"
import { describe, expect, test } from "vitest"

import { generateCode } from "../src"
import { generateQuerySchema } from "../src/query-schema"

async function buildSimpleQueryCode() {
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
      name: "dateField",
      type: "date",
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

  const mainModel = Object.values(models).find((ele) => ele.root === true)

  const filterFields = mainModel?.fields
    ? Object.values(mainModel.fields)
        .filter((ele) => ele.filter === true)
        .map((ele) => ({
          name: ele.name,
          type: ele.graphqlType,
        }))
    : []

  const filterTypes = [...new Set(filterFields.map((ele) => ele.type))]

  const generatedFactoryCode = generateQuerySchema({
    dateTimeFields: [],
    filterFields,
    filterTypes,
    models,
    queryName: "test",
    transformFields: [],
  })

  const generatedCodeFromFactory = await generateCode({
    fileName: "vitest_query-schema.ts",
    nodes: generatedFactoryCode,
  })

  return generatedCodeFromFactory
}

async function buildUserQueryCode() {
  const parsedColumns = parseColumns([
    { description: "", extra: "", name: "firstName", type: "varchar" },
    {
      description: "",
      extra: "",
      name: "createdAt",
      type: "timestamp(3)",
    },
    {
      description: "",
      extra: "",
      name: "updatedAt",
      type: "timestamp(3)",
    },
  ])

  const jsonSchema = generateJsonSchema(parsedColumns)

  const models = generateModel({
    isRoot: true,
    models: {},
    name: "User",
    source: jsonSchema,
  })

  const mainModel = Object.values(models).find((ele) => ele.root === true)

  const filterFields = mainModel?.fields
    ? Object.values(mainModel.fields)
        .filter((ele) => ele.filter === true)
        .map((ele) => ({
          name: ele.name,
          type: ele.graphqlType,
        }))
    : []

  const filterTypes = [...new Set(filterFields.map((ele) => ele.type))]

  const generatedFactoryCode = generateQuerySchema({
    dateTimeFields: ["createdAt", "updatedAt"],
    filterFields,
    filterTypes,
    models,
    queryName: "users",
    transformFields: [
      ["first_name", "firstName"],
      ["created_at", "createdAt"],
    ],
  })

  const generatedCodeFromFactory = await generateCode({
    fileName: "vitest_query-schema.ts",
    nodes: generatedFactoryCode,
  })

  return generatedCodeFromFactory
}

describe("query-schema file generator", () => {
  describe("simple query", () => {
    test("generates correct fileName", async () => {
      const generatedCodeFromFactory = await buildSimpleQueryCode()
      expect(generatedCodeFromFactory.fileName).toBe("vitest_query-schema.ts")
    })

    test("generates correct type imports", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain(
        'import type { ConnectionInterface, TrinoArrayResponse } from "@lakeql/api/types"'
      )
      expect(code).toContain('import type { JSONSchema7 } from "json-schema"')
    })

    test("generates correct builder imports", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('from "@lakeql/api/builder"')
      expect(code).toContain("builder")
      expect(code).toContain("PageInfo")
      expect(code).toContain("Paging")
      expect(code).toContain("SortDirection")
    })

    test("generates correct query-builder imports", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('from "@lakeql/query-builder"')
      expect(code).toContain("formatQuery")
      expect(code).toContain("generateQuery")
      expect(code).toContain("getSelectFields")
    })

    test("generates correct trino-client and local imports", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('from "@lakeql/trino-client"')
      expect(code).toContain("TrinoClient")
      expect(code).toContain('from "./interface"')
      expect(code).toContain("SimpleInterface")
      expect(code).toContain("TableDefinition")
    })

    test("generates config and json-schema imports", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('from "./config"')
      expect(code).toContain("hiveConfig")
      expect(code).toContain('import jsonSchema from "./json-schema.json"')
    })

    test("generates FilterInput with correct fields", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain("SimpleFilterInput")
      expect(code).toContain("StringFieldComparison")
      expect(code).toContain("IntFieldComparison")
      expect(code).toContain("BooleanFieldComparison")
      expect(code).toContain("DateFieldComparison")
    })

    test("generates FilterInput with datetime and logical operators", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain("DateTimeFieldComparison")
      expect(code).toContain("and")
      expect(code).toContain("or")
    })

    test("generates SortFields enum with field names", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain("SimpleSortFields")
      expect(code).toContain('"stringField"')
      expect(code).toContain('"integerField"')
      expect(code).toContain('"booleanField"')
      expect(code).toContain('"dateField"')
    })

    test("generates SortFields enum with remaining fields", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('"timestampField"')
      expect(code).toContain('"bigintField"')
      expect(code).toContain("SimpleSortOrder")
      expect(code).toContain("SortingInput")
    })

    test("generates object refs and Connection", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('builder.objectRef<SimpleInterface>("Simple")')
      expect(code).toContain(
        'builder.objectRef<ConnectionInterface<SimpleInterface>>("SimpleConnection")'
      )
    })

    test("generates transformFields and dateFields constants", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain("const transformFields = {}")
      expect(code).toContain("const dateFields = []")
    })

    test("generates queryFields with queryName", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain("builder.queryFields")
      expect(code).toContain("test:")
    })
  })

  describe("query with transform fields and datetime fields", () => {
    test("generates correct fileName", async () => {
      const generatedCodeFromFactory = await buildUserQueryCode()
      expect(generatedCodeFromFactory.fileName).toBe("vitest_query-schema.ts")
    })

    test("generates transformFields with correct key/value pairs", async () => {
      const { text: code } = await buildUserQueryCode()
      expect(code).toContain('first_name: "firstName"')
      expect(code).toContain('created_at: "createdAt"')
    })

    test("generates dateFields array with field names", async () => {
      const { text: code } = await buildUserQueryCode()
      expect(code).toContain('"createdAt"')
      expect(code).toContain('"updatedAt"')
      expect(code).toContain("const dateFields = [")
    })

    test("generates queryFields with correct queryName", async () => {
      const { text: code } = await buildUserQueryCode()
      expect(code).toContain("builder.queryFields")
      expect(code).toContain("users:")
    })

    test("generates model-specific names", async () => {
      const { text: code } = await buildUserQueryCode()
      expect(code).toContain("UserFilterInput")
      expect(code).toContain("UserSortFields")
      expect(code).toContain("UserSortOrder")
    })

    test("generates model object refs", async () => {
      const { text: code } = await buildUserQueryCode()
      expect(code).toContain('builder.objectRef<UserInterface>("User")')
      expect(code).toContain(
        'builder.objectRef<ConnectionInterface<UserInterface>>("UserConnection")'
      )
    })
  })
})
