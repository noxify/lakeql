/**
 * Compile-time structural compatibility tests for `@lakeql/adapter-trino`
 * and `@lakeql/config`, run via Vitest's `--typecheck` mode.
 *
 * This file imports from BOTH packages to verify that the Trino adapter's
 * `trinoAdapterDefinition` is assignable to `AdapterDefinition<"trino",
 * TrinoConnectionConfig>` and that `defineConfig()` infers the correct
 * connection type — without the adapter depending on @lakeql/config at
 * runtime.
 */

import { trinoAdapterDefinition } from "@lakeql/adapter-trino"
import type {
  TrinoConnectionConfig,
  trinoAdapterFactory,
  validateTrinoConfig,
} from "@lakeql/adapter-trino"
import type {
  AdapterDefinition,
  DataSourceEntry,
  TypedLakeQLConfig,
} from "@lakeql/config"
import { describe, expectTypeOf, it } from "vitest"

describe("Trino adapter / config structural compatibility", () => {
  it("trinoAdapterDefinition is assignable to AdapterDefinition<'trino', TrinoConnectionConfig>", () => {
    expectTypeOf(trinoAdapterDefinition).toMatchTypeOf<
      AdapterDefinition<"trino", TrinoConnectionConfig>
    >()

    // Value-level assignment catches runtime-observable shape differences the
    // type-level match might miss.
    const adapterDef: AdapterDefinition<"trino", TrinoConnectionConfig> =
      trinoAdapterDefinition
    expectTypeOf(adapterDef).toMatchTypeOf<
      AdapterDefinition<"trino", TrinoConnectionConfig>
    >()
  })

  it("adapterName is the literal 'trino' (not widened to string)", () => {
    expectTypeOf(trinoAdapterDefinition.adapterName).toEqualTypeOf<"trino">()
  })

  it("factory is the exact trinoAdapterFactory reference", () => {
    expectTypeOf(trinoAdapterDefinition.factory).toEqualTypeOf<
      typeof trinoAdapterFactory
    >()
  })

  it("validateDataSourceConfig is validateTrinoConfig", () => {
    expectTypeOf(trinoAdapterDefinition.validateDataSourceConfig).toEqualTypeOf<
      typeof validateTrinoConfig
    >()
  })

  it("definition omits registrationOptions and mergeDataSourceConfig as required fields", () => {
    type DefinitionKeys = keyof typeof trinoAdapterDefinition
    expectTypeOf<"registrationOptions">().not.toMatchTypeOf<DefinitionKeys>()
    expectTypeOf<"mergeDataSourceConfig">().not.toMatchTypeOf<DefinitionKeys>()
  })
})

describe("defineConfig() connection-type inference for Trino", () => {
  type TrinoAdapters = readonly [typeof trinoAdapterDefinition]
  type TrinoEntry = DataSourceEntry<TrinoAdapters[number]>

  it("DataSourceEntry narrows connection to TrinoConnectionConfig", () => {
    expectTypeOf<
      TrinoEntry["connection"]
    >().toEqualTypeOf<TrinoConnectionConfig>()
  })

  it("DataSourceEntry narrows adapter to 'trino'", () => {
    expectTypeOf<TrinoEntry["adapter"]>().toEqualTypeOf<"trino">()
  })

  it("normalized TypedLakeQLConfig data sources carry the Trino connection type", () => {
    type TrinoConfig = TypedLakeQLConfig<TrinoAdapters>
    type NormalizedEntry = TrinoConfig["dataSources"][string]

    expectTypeOf<
      NormalizedEntry["connection"]
    >().toEqualTypeOf<TrinoConnectionConfig>()
    expectTypeOf<NormalizedEntry["adapter"]>().toEqualTypeOf<"trino">()
  })
})
