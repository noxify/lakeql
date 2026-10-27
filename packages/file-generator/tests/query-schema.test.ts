import { parseColumns } from "@lakeql/column-parser"
import { generateModel } from "@lakeql/schema-generator/graphql-schema"
import { generateJsonSchema } from "@lakeql/schema-generator/json-schema"
import type { JSONSchema7 } from "json-schema"
import { describe, expect, it } from "vitest"

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
    it("generates correct fileName", async () => {
      const generatedCodeFromFactory = await buildSimpleQueryCode()
      expect(generatedCodeFromFactory.fileName).toBe("vitest_query-schema.ts")
    })

    it("generates correct type imports", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain(
        'import type { ConnectionInterface } from "@lakeql/api/types"'
      )
    })

    it("generates correct builder imports", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('from "@lakeql/api/builder"')
      expect(code).toContain("builder")
      expect(code).toContain("PageInfo")
      expect(code).toContain("Paging")
      expect(code).toContain("SortDirection")
    })

    it("generates correct query-builder imports", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('from "@lakeql/query-builder"')
      expect(code).toContain("getSelectFields")
    })

    it("generates local interface imports", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('from "./interface"')
      expect(code).toContain("SimpleInterface")
    })

    it("generates config and json-schema imports", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('from "./config"')
      expect(code).toContain("sourceConfig")
      expect(code).toContain('import jsonSchema from "./json-schema.json"')
    })

    it("resolver resolves the read strategy via context, not a global runtime", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain("context.getReadStrategy(sourceConfig.dataSource)")
      // read() is called with the concrete node interface as its type argument
      // so the resolver returns a typed Connection, not DataSourceReadResult<unknown>.
      expect(code).toContain("readStrategy.read<SimpleInterface>(")
      expect(code).not.toContain("getRuntime")
    })

    it("resolver routes datasource errors through handleErrorResponse", async () => {
      const { text: code } = await buildSimpleQueryCode()
      // So adapter failures (e.g. PERMISSION_DENIED) become explicit GraphQL
      // errors instead of being masked to a generic "Unexpected error.".
      expect(code).toContain(
        'import { handleErrorResponse } from "@lakeql/api/helpers"'
      )
      expect(code).toContain("try {")
      expect(code).toContain("catch (error)")
      expect(code).toContain("return handleErrorResponse(error)")
      // `return await` (not bare `return`) is required so the try/catch
      // actually catches the read's async rejection.
      expect(code).toContain("return await readStrategy.read<SimpleInterface>(")
    })

    it("resolver passes perPage through without a default fallback", async () => {
      const { text: code } = await buildSimpleQueryCode()
      // An omitted perPage must reach the read strategy as undefined so the
      // data source's configured default page size applies; the generator no
      // longer bakes in a `?? 100` fallback at the GraphQL layer.
      expect(code).toContain("args.paging?.perPage")
      expect(code).not.toContain("?? 100")
    })

    it("generates FilterInput with correct fields", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain("SimpleFilterInput")
      expect(code).toContain("StringFieldComparison")
      expect(code).toContain("IntFieldComparison")
      expect(code).toContain("BooleanFieldComparison")
      expect(code).toContain("DateFieldComparison")
    })

    it("generates FilterInput with datetime and logical operators", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain("DateTimeFieldComparison")
      expect(code).toContain("and")
      expect(code).toContain("or")
    })

    it("generates SortFields enum with field names", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain("SimpleSortFields")
      expect(code).toContain('"stringField"')
      expect(code).toContain('"integerField"')
      expect(code).toContain('"booleanField"')
      expect(code).toContain('"dateField"')
    })

    it("generates SortFields enum with remaining fields", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('"timestampField"')
      expect(code).toContain('"bigintField"')
      expect(code).toContain("SimpleSortOrder")
      expect(code).toContain("SortingInput")
    })

    it("generates object refs and Connection", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain('builder.objectRef<SimpleInterface>("Simple")')
      expect(code).toContain(
        'builder.objectRef<ConnectionInterface<SimpleInterface>>("SimpleConnection")'
      )
    })

    it("generates transformFields and dateFields constants", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain(
        "const transformFields: Record<string, string> = {}"
      )
      expect(code).toContain("const dateFields: string[] = [")
    })

    it("generates queryFields with queryName", async () => {
      const { text: code } = await buildSimpleQueryCode()
      expect(code).toContain("builder.queryFields")
      expect(code).toContain("test:")
    })
  })

  describe("query with transform fields and datetime fields", () => {
    it("generates correct fileName", async () => {
      const generatedCodeFromFactory = await buildUserQueryCode()
      expect(generatedCodeFromFactory.fileName).toBe("vitest_query-schema.ts")
    })

    it("generates transformFields with correct key/value pairs", async () => {
      const { text: code } = await buildUserQueryCode()
      expect(code).toContain('first_name: "firstName"')
      expect(code).toContain('created_at: "createdAt"')
    })

    it("generates dateFields array with field names", async () => {
      const { text: code } = await buildUserQueryCode()
      expect(code).toContain('"createdAt"')
      expect(code).toContain('"updatedAt"')
      expect(code).toContain("const dateFields: string[] = [")
    })

    it("generates queryFields with correct queryName", async () => {
      const { text: code } = await buildUserQueryCode()
      expect(code).toContain("builder.queryFields")
      expect(code).toContain("users:")
    })

    it("generates model-specific names", async () => {
      const { text: code } = await buildUserQueryCode()
      expect(code).toContain("UserFilterInput")
      expect(code).toContain("UserSortFields")
      expect(code).toContain("UserSortOrder")
    })

    it("generates model object refs", async () => {
      const { text: code } = await buildUserQueryCode()
      expect(code).toContain('builder.objectRef<UserInterface>("User")')
      expect(code).toContain(
        'builder.objectRef<ConnectionInterface<UserInterface>>("UserConnection")'
      )
    })

    it("deduplicates transform fields with the same key", async () => {
      const parsedColumns = parseColumns([
        { description: "", extra: "", name: "fullName", type: "varchar" },
      ])

      const jsonSchema = generateJsonSchema(parsedColumns)

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "User",
        source: jsonSchema,
      })

      const generatedFactoryCode = generateQuerySchema({
        dateTimeFields: [],
        filterFields: [],
        filterTypes: [],
        models,
        queryName: "users",
        transformFields: [
          ["full_name", "fullName"],
          ["full_name", "fullName"],
        ],
      })

      const generatedCodeFromFactory = await generateCode({
        fileName: "vitest_query-schema.ts",
        nodes: generatedFactoryCode,
      })

      const occurrences =
        generatedCodeFromFactory.text.match(/full_name:/gu)?.length ?? 0

      expect(occurrences).toBe(1)
    })

    it("throws on conflicting transform field mappings", () => {
      const jsonSchema: JSONSchema7 = {
        additionalProperties: false,
        properties: {
          fieldName: {
            type: "string",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Conflicting",
        source: jsonSchema,
      })

      expect(() =>
        generateQuerySchema({
          dateTimeFields: [],
          filterFields: [],
          filterTypes: [],
          models,
          queryName: "conflicting",
          transformFields: [
            ["full_name", "fullName"],
            ["full_name", "fullName2"],
          ],
        })
      ).toThrow(
        'Conflicting transform field mapping for "full_name": "fullName" vs "fullName2".'
      )
    })

    it("types empty dateFields as string array", async () => {
      const jsonSchema: JSONSchema7 = {
        additionalProperties: false,
        properties: {
          fieldName: {
            type: "string",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "NoDates",
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
        queryName: "noDates",
        transformFields: [],
      })

      const generatedCodeFromFactory = await generateCode({
        fileName: "vitest_query-schema.ts",
        nodes: generatedFactoryCode,
      })

      expect(generatedCodeFromFactory.text).toContain(
        "const dateFields: string[] = []"
      )
    })
  })
})
