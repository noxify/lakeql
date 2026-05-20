import formatCode from "@lakeql/helpers/format-code"
import { describe, expect, test } from "vitest"

import { generateCode } from "../src"
import { generateConfig } from "../src/config"

describe("config file generator", () => {
  test("config file w/o mutation", async () => {
    const generatedFactoryCode = generateConfig({
      catalog: "vitest_catalog",
      queryName: "vitest_query_name",
      schema: "vitest_schema",
      tableName: "vitest_table",
    })

    const generatedCodeFromFactory = await generateCode({
      fileName: "vitest_config.ts",
      nodes: generatedFactoryCode,
    })

    const expectedCode = await formatCode(`
      export const hiveConfig = {
        catalog: "vitest_catalog",
        schema: "vitest_schema",
        tableName: "vitest_table",
      } as const

      export const docsConfig = {
        query: true,
        mutation: false,
        queryName: "vitest_query_name",
        mutationName: null,
      }
    `)

    expect(generatedCodeFromFactory.text).toBe(expectedCode)
    expect(generatedCodeFromFactory.fileName).toBe("vitest_config.ts")
  })

  test("config file w/ mutation", async () => {
    const generatedFactoryCode = generateConfig({
      catalog: "vitest_catalog",
      mutationName: ["vitest_mutation_name"],
      queryName: "vitest_query_name",
      schema: "vitest_schema",
      tableName: "vitest_table",
    })

    const generatedCodeFromFactory = await generateCode({
      fileName: "vitest_config.ts",
      nodes: generatedFactoryCode,
    })

    const expectedCode = await formatCode(`
      export const hiveConfig = {
        catalog: "vitest_catalog",
        schema: "vitest_schema",
        tableName: "vitest_table",
      } as const

      export const docsConfig = {
        query: true,
        mutation: true,
        queryName: "vitest_query_name",
        mutationName: ["vitest_mutation_name"],
      }
    `)

    expect(generatedCodeFromFactory.text).toBe(expectedCode)
    expect(generatedCodeFromFactory.fileName).toBe("vitest_config.ts")
  })
})
