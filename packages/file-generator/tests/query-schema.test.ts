import { parseColumns } from "@lakeql/column-parser"
import { generateModel } from "@lakeql/schema-generator/graphql-schema"
import { generateJsonSchema } from "@lakeql/schema-generator/json-schema"
import { describe, expect, test } from "vitest"

import { generateCode } from "../src"
import { generateQuerySchema } from "../src/query-schema"

describe("query-schema file generator", () => {
  test("simple query", async () => {
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

    // get all filterable fields from the main model
    const filterFields = mainModel?.fields
      ? Object.values(mainModel.fields)
          .filter((ele) => ele.filter === true)
          .map((ele) => ({
            name: ele.name,
            type: ele.graphqlType,
          }))
      : []

    // get a unique list of possible filter types
    // this will be used later in the file generation
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
      fileName: "vitest_interface.ts",
      nodes: generatedFactoryCode,
    })

    expect(generatedCodeFromFactory.text).toContain("test")
  })
})
