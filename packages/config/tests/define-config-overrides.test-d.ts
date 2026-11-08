/* oxlint-disable vitest/expect-expect -- type-level test: assertions are compile-time via @ts-expect-error / expectTypeOf, not runtime expect() */

import { describe, expectTypeOf, it } from "vitest"

import type {
  AdapterDefinition,
  DataSourceEntry,
  DataSourcesFor,
  OverridesFor,
} from "../src/index"

// -- Adapter type fixtures --

interface TrinoConnection {
  host: string
  port: number
  catalog: string
}

interface FabricConnection {
  workspace: string
  lakehouse: string
}

interface TrinoOptions {
  queryTimeout: string
}

// Trino declares real registration options (third type parameter).
declare const optionsAdapter: AdapterDefinition<
  "with-options",
  TrinoConnection,
  TrinoOptions
>

// Fabric/Trino-style adapters declare no registration options, so TOptions
// defaults to `unknown`.
declare const optionlessAdapter: AdapterDefinition<
  "optionless",
  FabricConnection
>

type MultiAdapters = readonly [typeof optionsAdapter, typeof optionlessAdapter]

type OptionsEntry = Extract<
  DataSourceEntry<MultiAdapters[number]>,
  { adapter: "with-options" }
>
type OptionlessEntry = Extract<
  DataSourceEntry<MultiAdapters[number]>,
  { adapter: "optionless" }
>

type Sources = DataSourcesFor<MultiAdapters>

// -- OverridesFor helper: direct type-level coverage --

describe("OverridesFor conditional type", () => {
  it("maps a concrete options type to Partial<TOptions>", () => {
    expectTypeOf<OverridesFor<TrinoOptions>>().toEqualTypeOf<
      Partial<TrinoOptions>
    >()
  })

  it("maps unknown (the AdapterDefinition default) to never", () => {
    expectTypeOf<OverridesFor<unknown>>().toEqualTypeOf<never>()
  })

  it("maps never to never", () => {
    expectTypeOf<OverridesFor<never>>().toEqualTypeOf<never>()
  })

  it("maps a key-less object type to never (same keyof branch as unknown)", () => {
    // An empty record carries no keys, so `keyof` is `never` and the
    // conditional collapses to `never` exactly as it does for `unknown`.
    expectTypeOf<OverridesFor<Record<never, never>>>().toEqualTypeOf<never>()
  })
})

// -- Adapter WITH registration options: unchanged behavior --

describe("overrides for an adapter WITH registration options", () => {
  it("keeps overrides typed as Partial<TOptions> | undefined", () => {
    expectTypeOf<OptionsEntry["overrides"]>().toEqualTypeOf<
      Partial<TrinoOptions> | undefined
    >()
  })

  it("accepts a correct partial override", () => {
    const _sources: Sources = {
      warehouse: {
        adapter: "with-options",
        connection: { host: "localhost", port: 8080, catalog: "hive" },
        overrides: { queryTimeout: "5s" },
      },
    }
    expectTypeOf(_sources).toEqualTypeOf<Sources>()
  })

  it("@ts-expect-error - a wrong-shaped override is a type error", () => {
    const _sources: Sources = {
      warehouse: {
        adapter: "with-options",
        connection: { host: "localhost", port: 8080, catalog: "hive" },
        // @ts-expect-error - queryTimeout must be a string, not a number
        overrides: { queryTimeout: 5 },
      },
    }
    expectTypeOf(_sources).toEqualTypeOf<Sources>()
  })
})

// -- Adapter WITHOUT registration options: Partial<unknown> hole closed --

describe("overrides for an adapter WITHOUT registration options", () => {
  it("collapses overrides to never (not Partial<unknown>)", () => {
    expectTypeOf<
      Required<OptionlessEntry>["overrides"]
    >().toEqualTypeOf<never>()
    expectTypeOf<Required<OptionlessEntry>["overrides"]>().not.toBeUnknown()
    expectTypeOf<Required<OptionlessEntry>["overrides"]>().not.toBeAny()
  })

  it("still compiles when the entry omits overrides (backward compatible)", () => {
    const _sources: Sources = {
      lake: {
        adapter: "optionless",
        connection: { workspace: "ws", lakehouse: "lh" },
      },
    }
    expectTypeOf(_sources).toEqualTypeOf<Sources>()
  })

  it("@ts-expect-error - assigning an arbitrary overrides object is now a type error", () => {
    const _sources: Sources = {
      lake: {
        adapter: "optionless",
        connection: { workspace: "ws", lakehouse: "lh" },
        // @ts-expect-error - optionless adapter has no overrides (never)
        overrides: { anything: 1 },
      },
    }
    expectTypeOf(_sources).toEqualTypeOf<Sources>()
  })
})
