// oxlint-disable typescript/no-explicit-any

import type { AdapterFactory } from "@lakeql/datasource"
import { FakeAdapterFactory } from "@lakeql/datasource/testing"
import { describe, expect, it } from "vitest"

import type { AdapterDefinition } from "../src/index"
import {
  DataSourceConfigError,
  DuplicateAdapterError,
  defineConfig,
} from "../src/index"

/**
 * Creates a minimal AdapterDefinition stub with a custom adapter name.
 */
function makeAdapterDefinition(
  name: string,
  options?: { registrationOptions?: unknown }
) {
  const base = new FakeAdapterFactory()
  return {
    adapterName: name,
    factory: {
      adapterName: name,
      createDataSource: base.createDataSource.bind(base),
      createReadStrategy: base.createReadStrategy.bind(base),
      createWriteStrategy: base.createWriteStrategy.bind(base),
    } as AdapterFactory,
    registrationOptions: options?.registrationOptions,
    validateDataSourceConfig: () => {},
  } as unknown as AdapterDefinition<string, unknown>
}

describe("defineConfig() - statelessness (no cross-call influence)", () => {
  it("second call result is independent of first call", () => {
    const adapterA = makeAdapterDefinition("alpha")
    const adapterB = makeAdapterDefinition("beta")

    defineConfig({
      adapters: [adapterA],
      dataSources: {
        srcA: { adapter: "alpha", connection: { host: "a.local" } },
      },
    })

    const r2 = defineConfig({
      adapters: [adapterB],
      dataSources: {
        srcB: { adapter: "beta", connection: { host: "b.local" } },
      },
    })

    // r2 only knows about adapterB, not adapterA
    expect(r2.adapters[0]).toBe(adapterB)
    expect(r2.dataSources).toHaveProperty("srcB")
    expect(r2.dataSources).not.toHaveProperty("srcA")
  })

  it("first call result is not mutated by second call", () => {
    const adapterA = makeAdapterDefinition("alpha")
    const adapterB = makeAdapterDefinition("beta")

    const r1 = defineConfig({
      adapters: [adapterA],
      dataSources: {
        srcA: { adapter: "alpha", connection: { host: "a.local" } },
      },
    })

    defineConfig({
      adapters: [adapterB],
      dataSources: {
        srcB: { adapter: "beta", connection: { host: "b.local" } },
      },
    })

    // r1 remains unchanged — not contaminated by the second call
    expect(r1.adapters[0]).toBe(adapterA)
    expect(r1.dataSources).toHaveProperty("srcA")
    expect(r1.dataSources).not.toHaveProperty("srcB")
  })

  it("failed call does not affect subsequent valid calls", () => {
    const dupA = makeAdapterDefinition("dup")
    const dupB = makeAdapterDefinition("dup")
    const validAdapter = makeAdapterDefinition("valid")

    // First call throws due to duplicate adapter
    expect(() =>
      defineConfig({
        adapters: [dupA, dupB],
        dataSources: {},
      })
    ).toThrow(DuplicateAdapterError)

    // Second call with valid input succeeds unaffected
    const result = defineConfig({
      adapters: [validAdapter],
      dataSources: {
        ds: { adapter: "valid", connection: { host: "ok" } },
      },
    })

    expect(result.adapters[0]).toBe(validAdapter)
    expect(result.dataSources).toHaveProperty("ds")
  })

  it("adapters registered in one call are not visible in another call", () => {
    const trino = makeAdapterDefinition("trino")
    const fabric = makeAdapterDefinition("fabric")

    // Call 1 registers trino
    defineConfig({
      adapters: [trino],
      dataSources: {
        warehouse: { adapter: "trino", connection: { host: "t.local" } },
      },
    })

    // Call 2 registers only fabric — trino should NOT be visible
    // Referencing "trino" as adapter should throw because it is not registered
    expect(() =>
      defineConfig({
        adapters: [fabric],
        dataSources: {
          ds: { adapter: "trino", connection: { host: "t.local" } },
        },
      })
    ).toThrow(DataSourceConfigError)
  })

  it("cross-call unknown adapter error carries correct source name", () => {
    const trino = makeAdapterDefinition("trino")
    const fabric = makeAdapterDefinition("fabric")

    // First call registers trino
    defineConfig({
      adapters: [trino],
      dataSources: {},
    })

    // Second call only knows fabric — referencing trino fails
    let caught: DataSourceConfigError | undefined
    try {
      defineConfig({
        adapters: [fabric],
        dataSources: {
          ds: { adapter: "trino", connection: { host: "t.local" } },
        },
      })
    } catch (error: unknown) {
      caught = error as DataSourceConfigError
    }

    expect(caught).toBeInstanceOf(DataSourceConfigError)
    expect(caught?.sourceName).toBe("ds")
  })
})
