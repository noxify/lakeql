import { describe, expectTypeOf, it } from "vitest"

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

interface FabricConnection {
  workspace: string
  lakehouse: string
}

interface TrinoStorageWriteConfig {
  strategy?: "storage"
  [key: string]: unknown
}

interface TrinoInsertWriteConfig {
  strategy: "insert"
  batchSize?: number
  autoCreateTable?: boolean
  tableProperties?: Record<string, string>
}

type TrinoWriteConfig = TrinoStorageWriteConfig | TrinoInsertWriteConfig

// Trino declares a write validator, so TWriteConfig = TrinoWriteConfig.
declare const trinoAdapter: AdapterDefinition<
  "trino",
  TrinoConnection,
  unknown,
  TrinoWriteConfig
>

// Fabric declares no write validator, so TWriteConfig defaults to never.
declare const fabricAdapter: AdapterDefinition<"fabric", FabricConnection>

type MultiAdapters = readonly [typeof trinoAdapter, typeof fabricAdapter]

type TrinoEntry = Extract<
  DataSourceEntry<MultiAdapters[number]>,
  { adapter: "trino" }
>
type FabricEntry = Extract<
  DataSourceEntry<MultiAdapters[number]>,
  { adapter: "fabric" }
>

type Sources = DataSourcesFor<MultiAdapters>

// -- Tests --

describe("Typed writeConfig inference (R1-R3, R5)", () => {
  it("R1: an adapter without a write generic defaults TWriteConfig to never", () => {
    expectTypeOf<Required<FabricEntry>["writeConfig"]>().toEqualTypeOf<never>()
  })

  it("R3: Trino entry writeConfig is TrinoWriteConfig | undefined", () => {
    expectTypeOf<TrinoEntry["writeConfig"]>().toEqualTypeOf<
      TrinoWriteConfig | undefined
    >()
  })

  it("R2: Trino writeConfig is not unknown or any", () => {
    expectTypeOf<Required<TrinoEntry>["writeConfig"]>().not.toBeUnknown()
    expectTypeOf<Required<TrinoEntry>["writeConfig"]>().not.toBeAny()
  })

  it("R2: a valid Trino insert writeConfig is accepted", () => {
    const _sources: Sources = {
      warehouse: {
        adapter: "trino",
        connection: { host: "localhost", port: 8080, catalog: "hive" },
        writeConfig: { strategy: "insert", batchSize: 500 },
      },
    }
    expectTypeOf(_sources).toEqualTypeOf<Sources>()
  })

  it("R2: @ts-expect-error - invalid Trino strategy is rejected", () => {
    const _sources: Sources = {
      warehouse: {
        adapter: "trino",
        connection: { host: "localhost", port: 8080, catalog: "hive" },
        // @ts-expect-error - "copy" is not a valid TrinoWriteConfig strategy
        writeConfig: { strategy: "copy" },
      },
    }
    expectTypeOf(_sources).toEqualTypeOf<Sources>()
  })

  it("R2: @ts-expect-error - a Fabric writeConfig value is rejected", () => {
    const _sources: Sources = {
      lake: {
        adapter: "fabric",
        connection: { workspace: "ws", lakehouse: "lh" },
        // @ts-expect-error - Fabric has no writeConfig (never)
        writeConfig: { strategy: "insert" },
      },
    }
    expectTypeOf(_sources).toEqualTypeOf<Sources>()
  })

  it("R2: a Fabric entry without writeConfig compiles", () => {
    const _sources: Sources = {
      lake: {
        adapter: "fabric",
        connection: { workspace: "ws", lakehouse: "lh" },
      },
    }
    expectTypeOf(_sources).toEqualTypeOf<Sources>()
  })

  it("R1: a three-argument AdapterDefinition still compiles (TWriteConfig defaults)", () => {
    type ThreeArg = AdapterDefinition<"legacy", TrinoConnection, unknown>
    type Entry = Extract<DataSourceEntry<ThreeArg>, { adapter: "legacy" }>
    expectTypeOf<Required<Entry>["writeConfig"]>().toEqualTypeOf<never>()
  })
})
