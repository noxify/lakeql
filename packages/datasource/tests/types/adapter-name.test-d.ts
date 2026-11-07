import { assertType, describe, expectTypeOf, it } from "vitest"

import type { AdapterName, SourceConfig } from "../../src/types/adapter"

describe("AdapterName openness", () => {
  it("an unknown string satisfies AdapterName", () => {
    const unknownAdapter = "some-future-adapter"
    expectTypeOf(unknownAdapter).toMatchTypeOf<AdapterName>()
  })

  it("adapter-local literals satisfy AdapterName", () => {
    const trino = "trino" as const
    const fabric = "fabric" as const
    const custom = "my-custom-adapter" as const

    expectTypeOf(trino).toMatchTypeOf<AdapterName>()
    expectTypeOf(fabric).toMatchTypeOf<AdapterName>()
    expectTypeOf(custom).toMatchTypeOf<AdapterName>()
  })

  it("AdapterName is assignable from string", () => {
    expectTypeOf<string>().toMatchTypeOf<AdapterName>()
  })
})

function getAdapter(): string {
  return "runtime-resolved"
}

describe("SourceConfig adapter name acceptance", () => {
  it("SourceConfig accepts arbitrary adapter name strings", () => {
    assertType<SourceConfig>({
      dataSource: "my-ds",
      adapter: "unknown-adapter",
      catalog: "catalog",
      schema: "schema",
      tableName: "table",
    })
  })

  it("SourceConfig accepts adapter-local literal types", () => {
    const trinoConfig = {
      dataSource: "warehouse",
      adapter: "trino" as const,
      catalog: "hive",
      schema: "default",
      tableName: "events",
    }

    assertType<SourceConfig>(trinoConfig)
    expectTypeOf(trinoConfig).toMatchTypeOf<SourceConfig>()
  })

  it("SourceConfig accepts a dynamically typed adapter field", () => {
    assertType<SourceConfig>({
      dataSource: "ds",
      adapter: getAdapter(),
      catalog: "c",
      schema: "s",
      tableName: "t",
    })
  })
})
