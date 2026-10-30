import { describe, expect, it } from "vitest"

import { FakeAdapterFactory } from "../src/testing/fake-adapter-factory"
import type { DataSource } from "../src/types/datasource"
import type { DataSourceReadInput } from "../src/types/read"
import type { DataSourceWriteInput } from "../src/types/write"

const resolveAuth = async () => ({})

/**
 * Proves that the AdapterFactory contract can be implemented by a
 * third-party package without importing @lakeql/config or any
 * concrete adapter internals.
 */
describe("AdapterFactory contract", () => {
  const factory = new FakeAdapterFactory()

  it("adapterName is a non-empty string", () => {
    expect(factory.adapterName).toBeTypeOf("string")
    expect(factory.adapterName.length).toBeGreaterThan(0)
  })

  it("createDataSource returns a DataSource", () => {
    const ds: DataSource = factory.createDataSource({}, "test-source")

    expect(ds.adapter).toBeTypeOf("string")
    expect(ds.capabilities).toBeDefined()
    expect(ds.query).toBeTypeOf("function")
    expect(ds.stream).toBeTypeOf("function")
    expect(ds.close).toBeTypeOf("function")
  })

  it("createReadStrategy returns an object with a read method", () => {
    const ds = factory.createDataSource({}, "test-source")

    const strategy = factory.createReadStrategy({ dataSource: ds, resolveAuth })

    expect(strategy.read).toBeTypeOf("function")
  })

  it("createWriteStrategy returns an object with a write method", () => {
    const ds = factory.createDataSource({}, "test-source")

    const strategy = factory.createWriteStrategy({
      dataSource: ds,
      dataSourceName: "test-source",
      writeConfig: {},
    })

    expect(strategy.write).toBeTypeOf("function")
  })

  it("read strategy returns a result when invoked", async () => {
    const ds = factory.createDataSource({}, "test-source")
    const strategy = factory.createReadStrategy({ dataSource: ds, resolveAuth })

    const input: DataSourceReadInput = {
      sourceConfig: {
        dataSource: "test",
        adapter: "fake",
        catalog: "c",
        schema: "s",
        tableName: "t",
      },
      selectFields: [],
      filter: undefined,
      paging: { page: 1, perPage: 10 },
      sorting: [],
      transformFields: {},
      dateFields: [],
      schema: undefined,
      context: undefined,
    }
    const result = await strategy.read(input)

    expect(result).toBeDefined()
  })

  it("write strategy resolves without error", async () => {
    const ds = factory.createDataSource({}, "test-source")
    const strategy = factory.createWriteStrategy({
      dataSource: ds,
      dataSourceName: "test-source",
      writeConfig: {},
    })

    const input: DataSourceWriteInput = {
      records: [],
      schema: undefined,
      config: { table: { catalog: "c", schema: "s", tableName: "t" } },
    }
    await expect(strategy.write(input)).resolves.toBeUndefined()
  })
})
