import type { AdapterFactory } from "@lakeql/datasource"
import { describe, expectTypeOf, it } from "vitest"

import { defineConfig } from "../src/index"
import type {
  AdapterDefinition,
  LoadedLakeQLProject,
  NormalizedDataSourceEntry,
  TypedLakeQLConfig,
} from "../src/index"

// --- Test adapter fixtures ---

interface TestConnection {
  url: string
}

interface TestRegOptions {
  timeout: number
}

interface OtherConnection {
  host: string
  port: number
}

declare const testAdapter: AdapterDefinition<
  "test",
  TestConnection,
  TestRegOptions
>

declare const otherAdapter: AdapterDefinition<"other", OtherConnection>

describe("defineConfig output shape type-level tests", () => {
  const result = defineConfig({
    adapters: [testAdapter],
    dataSources: {
      main: {
        adapter: "test",
        connection: { url: "http://localhost" },
      },
    },
  })

  it("return type is TypedLakeQLConfig, not LoadedLakeQLProject", () => {
    // Positive: result is assignable to TypedLakeQLConfig
    expectTypeOf(result).toMatchTypeOf<
      TypedLakeQLConfig<readonly [typeof testAdapter]>
    >()

    // Negative: result is NOT LoadedLakeQLProject
    expectTypeOf(result).not.toMatchTypeOf<LoadedLakeQLProject>()
  })

  it("dataSources is readonly (Readonly<Record<...>>)", () => {
    // Verify readonly by checking the type matches Readonly<Record<...>>
    expectTypeOf(result.dataSources).toMatchTypeOf<
      Readonly<Record<string, NormalizedDataSourceEntry<typeof testAdapter>>>
    >()
  })

  it("normalized data source entries have NO overrides field", () => {
    type Entry = (typeof result.dataSources)[string]

    // The entry type should not have an 'overrides' property
    expectTypeOf<Entry>().not.toHaveProperty("overrides")
  })

  it("normalized data source entries have readonly adapter, connection, and optional writeConfig", () => {
    type Entry = (typeof result.dataSources)[string]

    // adapter narrows to the adapter name
    expectTypeOf<Entry["adapter"]>().toEqualTypeOf<"test">()

    // connection narrows to the adapter's connection type
    expectTypeOf<Entry["connection"]>().toEqualTypeOf<TestConnection>()

    // writeConfig is present as an optional property
    expectTypeOf<Entry>().toHaveProperty("writeConfig")
  })

  it("adapters field preserves the AdapterDefinition tuple type", () => {
    // The adapters field should be the exact input tuple
    expectTypeOf(result.adapters).toEqualTypeOf<readonly [typeof testAdapter]>()

    // Verify each element has the expected adapter shape properties
    type AdaptersType = typeof result.adapters
    type HasAdapterShape = AdaptersType extends readonly {
      readonly adapterName: string
      readonly factory: AdapterFactory
    }[]
      ? true
      : false
    expectTypeOf<HasAdapterShape>().toEqualTypeOf<true>()
  })

  it("adapters field retains individual adapter definition identity type", () => {
    // First element preserves the full generic type
    expectTypeOf(result.adapters[0]).toEqualTypeOf<typeof testAdapter>()
  })

  it("defineConfig return type matches TypedLakeQLConfig generic", () => {
    // The inferred return type should equal the constructed TypedLakeQLConfig
    type Expected = TypedLakeQLConfig<readonly [typeof testAdapter]>
    expectTypeOf<typeof result>().toEqualTypeOf<Expected>()
  })

  it("multi-adapter tuple is preserved in output", () => {
    const multiResult = defineConfig({
      adapters: [testAdapter, otherAdapter],
      dataSources: {
        a: { adapter: "test", connection: { url: "x" } },
        b: { adapter: "other", connection: { host: "h", port: 1 } },
      },
    })

    // Adapters tuple preserves both entries
    expectTypeOf(multiResult.adapters).toEqualTypeOf<
      readonly [typeof testAdapter, typeof otherAdapter]
    >()

    // Return type is correctly parameterized
    type Expected = TypedLakeQLConfig<
      readonly [typeof testAdapter, typeof otherAdapter]
    >
    expectTypeOf<typeof multiResult>().toEqualTypeOf<Expected>()
  })
})
