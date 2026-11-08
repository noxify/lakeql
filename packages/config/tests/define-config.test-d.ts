// oxlint-disable typescript/no-non-null-assertion
/* oxlint-disable vitest/expect-expect -- type-level test: assertions are compile-time via @ts-expect-error / expectTypeOf, not runtime expect() */

import { describe, expectTypeOf, it } from "vitest"

import type { AdapterDefinition, DataSourceEntry } from "../src/index"
import { defineConfig } from "../src/index"

// --- Single-adapter test fixtures ---

interface TrinoConnection {
  host: string
  port: number
}

interface TrinoOptions {
  queryTimeout: string
}

declare const trinoAdapter: AdapterDefinition<
  "trino",
  TrinoConnection,
  TrinoOptions
>

describe("defineConfig type-level tests: single-adapter inference", () => {
  it("narrows connection type to the adapter's TDataSourceConfig", () => {
    const config = defineConfig({
      adapters: [trinoAdapter],
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost", port: 8080 },
        },
      },
    })

    // Output dataSources is a Record, index access may be undefined
    const entry = config.dataSources["warehouse"]!
    expectTypeOf(entry.connection).toEqualTypeOf<TrinoConnection>()
  })

  it("narrows overrides to Partial<TRegistrationOptions>", () => {
    defineConfig({
      adapters: [trinoAdapter],
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost", port: 8080 },
          overrides: { queryTimeout: "5s" },
        },
      },
    })

    // Verify the overrides field type via the DataSourceEntry utility
    type Entry = DataSourceEntry<typeof trinoAdapter>
    type OverridesField = Entry["overrides"]
    expectTypeOf<OverridesField>().toEqualTypeOf<
      Partial<TrinoOptions> | undefined
    >()
  })

  it("constrains adapter field to registered adapter name only", () => {
    defineConfig({
      adapters: [trinoAdapter],
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost", port: 8080 },
        },
      },
    })

    // The adapter field should only accept "trino"
    type Entry = DataSourceEntry<typeof trinoAdapter>
    expectTypeOf<Entry["adapter"]>().toEqualTypeOf<"trino">()
  })

  it("rejects unregistered adapter name with type error", () => {
    defineConfig({
      adapters: [trinoAdapter],
      dataSources: {
        warehouse: {
          // @ts-expect-error - "unknown" is not a registered adapter name
          adapter: "unknown",
          connection: { host: "localhost", port: 8080 },
        },
      },
    })
  })
})
