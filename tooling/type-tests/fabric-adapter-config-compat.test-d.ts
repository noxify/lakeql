/**
 * Compile-time structural compatibility tests for `@lakeql/adapter-fabric`
 * and `@lakeql/config`, run via Vitest's `--typecheck` mode.
 *
 * This file imports from BOTH packages to verify that the Fabric adapter's
 * `fabricAdapterDefinition` is assignable to `AdapterDefinition<"fabric",
 * FabricConnectionConfig>` and that `defineConfig()` infers the correct
 * connection type — without the adapter depending on @lakeql/config at
 * runtime.
 */

import { fabricAdapterDefinition } from "@lakeql/adapter-fabric"
import type {
  FabricConnectionConfig,
  fabricAdapterFactory,
  validateFabricConfig,
} from "@lakeql/adapter-fabric"
import type {
  AdapterDefinition,
  DataSourceEntry,
  TypedLakeQLConfig,
} from "@lakeql/config"
import { describe, expectTypeOf, it } from "vitest"

describe("Fabric adapter / config structural compatibility", () => {
  it("fabricAdapterDefinition is assignable to AdapterDefinition<'fabric', FabricConnectionConfig>", () => {
    expectTypeOf(fabricAdapterDefinition).toMatchTypeOf<
      AdapterDefinition<"fabric", FabricConnectionConfig>
    >()

    // Value-level assignment catches runtime-observable shape differences the
    // type-level match might miss.
    const adapterDef: AdapterDefinition<"fabric", FabricConnectionConfig> =
      fabricAdapterDefinition
    expectTypeOf(adapterDef).toMatchTypeOf<
      AdapterDefinition<"fabric", FabricConnectionConfig>
    >()
  })

  it("adapterName is the literal 'fabric' (not widened to string)", () => {
    expectTypeOf(fabricAdapterDefinition.adapterName).toEqualTypeOf<"fabric">()
  })

  it("factory is the exact fabricAdapterFactory reference", () => {
    expectTypeOf(fabricAdapterDefinition.factory).toEqualTypeOf<
      typeof fabricAdapterFactory
    >()
  })

  it("validateDataSourceConfig is validateFabricConfig", () => {
    expectTypeOf(
      fabricAdapterDefinition.validateDataSourceConfig
    ).toEqualTypeOf<typeof validateFabricConfig>()
  })

  it("definition omits registrationOptions and mergeDataSourceConfig as required fields", () => {
    type DefinitionKeys = keyof typeof fabricAdapterDefinition
    expectTypeOf<"registrationOptions">().not.toMatchTypeOf<DefinitionKeys>()
    expectTypeOf<"mergeDataSourceConfig">().not.toMatchTypeOf<DefinitionKeys>()
  })
})

describe("defineConfig() connection-type inference for Fabric", () => {
  type FabricAdapters = readonly [typeof fabricAdapterDefinition]
  type FabricEntry = DataSourceEntry<FabricAdapters[number]>

  it("DataSourceEntry narrows connection to FabricConnectionConfig", () => {
    expectTypeOf<
      FabricEntry["connection"]
    >().toEqualTypeOf<FabricConnectionConfig>()
  })

  it("DataSourceEntry narrows adapter to 'fabric'", () => {
    expectTypeOf<FabricEntry["adapter"]>().toEqualTypeOf<"fabric">()
  })

  it("normalized TypedLakeQLConfig data sources carry the Fabric connection type", () => {
    type FabricConfig = TypedLakeQLConfig<FabricAdapters>
    type NormalizedEntry = FabricConfig["dataSources"][string]

    expectTypeOf<
      NormalizedEntry["connection"]
    >().toEqualTypeOf<FabricConnectionConfig>()
    expectTypeOf<NormalizedEntry["adapter"]>().toEqualTypeOf<"fabric">()
  })
})
