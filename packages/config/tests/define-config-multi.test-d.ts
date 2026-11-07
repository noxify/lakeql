import { describe, expectTypeOf, it } from "vitest"
/* oxlint-disable vitest/expect-expect -- type-level test: assertions are compile-time via @ts-expect-error / expectTypeOf, not runtime expect() */

import type {
  AdapterDefinition,
  DataSourceEntry,
  DataSourcesFor,
} from "../src/index"

// -- Adapter type fixtures --

interface TrinoConnection {
  host: string
  port: number
  catalog: string
}

interface TrinoOptions {
  queryTimeout: string
}

interface FabricConnection {
  workspace: string
  lakehouse: string
}

interface FabricOptions {
  batchSize: number
}

// Declare adapters with mergeDataSourceConfig
declare const trinoAdapter: AdapterDefinition<
  "trino",
  TrinoConnection,
  TrinoOptions
>
declare const fabricAdapter: AdapterDefinition<
  "fabric",
  FabricConnection,
  FabricOptions
>

// Multi-adapter tuple
type MultiAdapters = readonly [typeof trinoAdapter, typeof fabricAdapter]

// -- Tests --

describe("Multi-adapter type inference", () => {
  it("per-adapter connection narrowing: trino", () => {
    type TrinoEntry = Extract<
      DataSourceEntry<MultiAdapters[number]>,
      { adapter: "trino" }
    >

    expectTypeOf<TrinoEntry["connection"]>().toEqualTypeOf<TrinoConnection>()
  })

  it("per-adapter connection narrowing: fabric", () => {
    type FabricEntry = Extract<
      DataSourceEntry<MultiAdapters[number]>,
      { adapter: "fabric" }
    >

    expectTypeOf<FabricEntry["connection"]>().toEqualTypeOf<FabricConnection>()
  })

  it("per-adapter overrides narrowing: trino overrides is Partial<TrinoOptions>", () => {
    type TrinoEntry = Extract<
      DataSourceEntry<MultiAdapters[number]>,
      { adapter: "trino" }
    >

    // overrides is optional, so the actual property type includes undefined
    expectTypeOf<Required<TrinoEntry>["overrides"]>().toEqualTypeOf<
      Partial<TrinoOptions>
    >()
  })

  it("per-adapter overrides narrowing: fabric overrides is Partial<FabricOptions>", () => {
    type FabricEntry = Extract<
      DataSourceEntry<MultiAdapters[number]>,
      { adapter: "fabric" }
    >

    expectTypeOf<Required<FabricEntry>["overrides"]>().toEqualTypeOf<
      Partial<FabricOptions>
    >()
  })

  it("@ts-expect-error: swapped connection type for trino adapter", () => {
    type Sources = DataSourcesFor<MultiAdapters>

    // Assigning FabricConnection to a "trino" data source should be a type error
    const _sources: Sources = {
      myTrino: {
        adapter: "trino",
        connection: {
          // @ts-expect-error - FabricConnection is not assignable to TrinoConnection
          workspace: "ws",
          lakehouse: "lh",
        } satisfies FabricConnection,
      },
    }
  })

  it("@ts-expect-error: foreign override field for trino adapter", () => {
    type Sources = DataSourcesFor<MultiAdapters>

    // Using fabric's override field (batchSize) for a trino data source should be a type error
    const _sources: Sources = {
      myTrino: {
        adapter: "trino",
        connection: { host: "localhost", port: 8080, catalog: "hive" },
        // @ts-expect-error - batchSize is not a field in Partial<TrinoOptions>
        overrides: { batchSize: 100 },
      },
    }
  })

  it("connection is not widened to unknown or any", () => {
    type TrinoEntry = Extract<
      DataSourceEntry<MultiAdapters[number]>,
      { adapter: "trino" }
    >
    type FabricEntry = Extract<
      DataSourceEntry<MultiAdapters[number]>,
      { adapter: "fabric" }
    >

    // Trino connection is not unknown or any
    expectTypeOf<TrinoEntry["connection"]>().not.toBeUnknown()
    expectTypeOf<TrinoEntry["connection"]>().not.toBeAny()

    // Fabric connection is not unknown or any
    expectTypeOf<FabricEntry["connection"]>().not.toBeUnknown()
    expectTypeOf<FabricEntry["connection"]>().not.toBeAny()
  })

  it("overrides is not widened to unknown or any", () => {
    type TrinoEntry = Extract<
      DataSourceEntry<MultiAdapters[number]>,
      { adapter: "trino" }
    >
    type FabricEntry = Extract<
      DataSourceEntry<MultiAdapters[number]>,
      { adapter: "fabric" }
    >

    // Trino overrides is not unknown or any
    expectTypeOf<Required<TrinoEntry>["overrides"]>().not.toBeUnknown()
    expectTypeOf<Required<TrinoEntry>["overrides"]>().not.toBeAny()

    // Fabric overrides is not unknown or any
    expectTypeOf<Required<FabricEntry>["overrides"]>().not.toBeUnknown()
    expectTypeOf<Required<FabricEntry>["overrides"]>().not.toBeAny()
  })

  it("independent narrowing without cross-contamination", () => {
    type TrinoEntry = Extract<
      DataSourceEntry<MultiAdapters[number]>,
      { adapter: "trino" }
    >
    type FabricEntry = Extract<
      DataSourceEntry<MultiAdapters[number]>,
      { adapter: "fabric" }
    >

    // Trino connection is NOT assignable to FabricConnection
    expectTypeOf<
      TrinoEntry["connection"]
    >().not.toEqualTypeOf<FabricConnection>()

    // Fabric connection is NOT assignable to TrinoConnection
    expectTypeOf<
      FabricEntry["connection"]
    >().not.toEqualTypeOf<TrinoConnection>()

    // Trino overrides is NOT the same as Fabric overrides
    expectTypeOf<Required<TrinoEntry>["overrides"]>().not.toEqualTypeOf<
      Partial<FabricOptions>
    >()

    // Fabric overrides is NOT the same as Trino overrides
    expectTypeOf<Required<FabricEntry>["overrides"]>().not.toEqualTypeOf<
      Partial<TrinoOptions>
    >()
  })
})
