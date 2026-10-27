import formatCode from "@lakeql/helpers/format-code"
import { describe, expect, it } from "vitest"

import { generateCode } from "../src"
import { generateConfig } from "../src/config"

describe("config file generator", () => {
  it("config file w/o mutation", async () => {
    const generatedFactoryCode = generateConfig({
      adapter: "trino",
      dataSourceName: "test",
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
      export const sourceConfig = {
        dataSource: "test",
        adapter: "trino",
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

  it("config file w/ mutation", async () => {
    const generatedFactoryCode = generateConfig({
      adapter: "trino",
      dataSourceName: "test",
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
      export const sourceConfig = {
        dataSource: "test",
        adapter: "trino",
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

  it("config file w/ empty mutation list", async () => {
    const generatedFactoryCode = generateConfig({
      adapter: "trino",
      dataSourceName: "test",
      catalog: "vitest_catalog",
      mutationName: [],
      queryName: "vitest_query_name",
      schema: "vitest_schema",
      tableName: "vitest_table",
    })

    const generatedCodeFromFactory = await generateCode({
      fileName: "vitest_config.ts",
      nodes: generatedFactoryCode,
    })

    const expectedCode = await formatCode(`
      export const sourceConfig = {
        dataSource: "test",
        adapter: "trino",
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

  it("config file w/ storageConfig partitioning: true", async () => {
    const generatedFactoryCode = generateConfig({
      adapter: "trino",
      dataSourceName: "test",
      catalog: "vitest_catalog",
      mutationName: ["vitest_mutation_name"],
      queryName: "vitest_query_name",
      schema: "vitest_schema",
      tableName: "vitest_table",
      storageConfig: {
        loadStrategy: "full_load_append",
        basePath: "data/events",
        partitioning: true,
        partitioningFormat: "year/month/day",
      },
    })

    const generatedCodeFromFactory = await generateCode({
      fileName: "vitest_config.ts",
      nodes: generatedFactoryCode,
    })

    const expectedCode = await formatCode(`
      export const sourceConfig = {
        dataSource: "test",
        adapter: "trino",
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

      export const storageConfig = {
        loadStrategy: "full_load_append",
        basePath: "data/events",
        partitioning: true,
        partitioningFormat: "year/month/day",
      } as const
    `)

    expect(generatedCodeFromFactory.text).toBe(expectedCode)
  })

  it("config file w/ storageConfig partitioning: false", async () => {
    const generatedFactoryCode = generateConfig({
      adapter: "trino",
      dataSourceName: "test",
      catalog: "vitest_catalog",
      mutationName: ["vitest_mutation_name"],
      queryName: "vitest_query_name",
      schema: "vitest_schema",
      tableName: "vitest_table",
      storageConfig: {
        loadStrategy: "append",
        basePath: "data/events",
        partitioning: false,
      },
    })

    const generatedCodeFromFactory = await generateCode({
      fileName: "vitest_config.ts",
      nodes: generatedFactoryCode,
    })

    const expectedCode = await formatCode(`
      export const sourceConfig = {
        dataSource: "test",
        adapter: "trino",
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

      export const storageConfig = {
        loadStrategy: "append",
        basePath: "data/events",
        partitioning: false,
      } as const
    `)

    expect(generatedCodeFromFactory.text).toBe(expectedCode)
  })

  it("config file w/ storageConfig partitioning: field name string", async () => {
    const generatedFactoryCode = generateConfig({
      adapter: "trino",
      dataSourceName: "test",
      catalog: "vitest_catalog",
      mutationName: ["vitest_mutation_name"],
      queryName: "vitest_query_name",
      schema: "vitest_schema",
      tableName: "vitest_table",
      storageConfig: {
        loadStrategy: "append",
        basePath: "data/events",
        partitioning: "event_date",
        partitioningFormat: "year/month",
      },
    })

    const generatedCodeFromFactory = await generateCode({
      fileName: "vitest_config.ts",
      nodes: generatedFactoryCode,
    })

    const expectedCode = await formatCode(`
      export const sourceConfig = {
        dataSource: "test",
        adapter: "trino",
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

      export const storageConfig = {
        loadStrategy: "append",
        basePath: "data/events",
        partitioning: "event_date",
        partitioningFormat: "year/month",
      } as const
    `)

    expect(generatedCodeFromFactory.text).toBe(expectedCode)
  })

  it("config file w/ storageConfig partitioningFormat: year", async () => {
    const generatedFactoryCode = generateConfig({
      adapter: "trino",
      dataSourceName: "test",
      catalog: "vitest_catalog",
      mutationName: ["vitest_mutation_name"],
      queryName: "vitest_query_name",
      schema: "vitest_schema",
      tableName: "vitest_table",
      storageConfig: {
        loadStrategy: "full_load_append",
        basePath: "data/events",
        partitioning: true,
        partitioningFormat: "year",
      },
    })

    const generatedCodeFromFactory = await generateCode({
      fileName: "vitest_config.ts",
      nodes: generatedFactoryCode,
    })

    const expectedCode = await formatCode(`
      export const sourceConfig = {
        dataSource: "test",
        adapter: "trino",
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

      export const storageConfig = {
        loadStrategy: "full_load_append",
        basePath: "data/events",
        partitioning: true,
        partitioningFormat: "year",
      } as const
    `)

    expect(generatedCodeFromFactory.text).toBe(expectedCode)
  })
})
