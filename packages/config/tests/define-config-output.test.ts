// oxlint-disable typescript/no-non-null-assertion

import type { AdapterFactory } from "@lakeql/datasource"
import { FakeAdapterFactory } from "@lakeql/datasource/testing"
import { describe, expect, it } from "vitest"

import type { AdapterDefinition } from "../src/index"
import { defineConfig } from "../src/index"

/**
 * Creates a minimal AdapterDefinition stub with a custom adapter name.
 */
function makeAdapterDefinition(
  name: string,
  options?: {
    registrationOptions?: unknown
    mergeDataSourceConfig?: (
      regOpts: unknown,
      sourceConfig: unknown
    ) => { connection: unknown; writeConfig?: unknown }
  }
) {
  const base = new FakeAdapterFactory()
  const def: Record<string, unknown> = {
    adapterName: name,
    factory: {
      adapterName: name,
      createDataSource: base.createDataSource.bind(base),
      createReadStrategy: base.createReadStrategy.bind(base),
      createWriteStrategy: base.createWriteStrategy.bind(base),
    } as AdapterFactory,
    registrationOptions: options?.registrationOptions,
    validateDataSourceConfig: () => {},
  }

  if (options?.mergeDataSourceConfig) {
    def.mergeDataSourceConfig = options.mergeDataSourceConfig
  }

  // Widen TWriteConfig to unknown so this fixture's entries can carry a
  // writeConfig value; these tests assert runtime pass-through, not per-adapter
  // write typing.
  return def as unknown as AdapterDefinition<string, unknown, unknown, unknown>
}

/** Stable module-scope resolver used to assert reference identity. */
const sampleImpersonationResolver = () =>
  Promise.resolve({ options: { impersonateAs: "alice" } })

describe("defineConfig() - output shape and identity", () => {
  it("preserves adapter identity: output.adapters[i] === input[i]", () => {
    const trino = makeAdapterDefinition("trino")
    const fabric = makeAdapterDefinition("fabric")

    const result = defineConfig({
      adapters: [trino, fabric],
      dataSources: {},
    })

    expect(result.adapters[0]).toBe(trino)
    expect(result.adapters[1]).toBe(fabric)
  })

  it("preserves factory identity: output.adapters[i].factory === input[i].factory", () => {
    const trino = makeAdapterDefinition("trino")

    const result = defineConfig({
      adapters: [trino],
      dataSources: {},
    })

    expect(result.adapters[0].factory).toBe(trino.factory)
  })

  it("normalized dataSources has no overrides field", () => {
    const trino = makeAdapterDefinition("trino")

    const result = defineConfig({
      adapters: [trino],
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost" },
          overrides: { timeout: "5s" },
        },
      },
    })

    expect(result.dataSources.warehouse).not.toHaveProperty("overrides")
    expect(result.dataSources.warehouse).toHaveProperty("adapter", "trino")
    expect(result.dataSources.warehouse).toHaveProperty("connection")
  })

  it("repeated calls produce deep-equal plain values", () => {
    const trino = makeAdapterDefinition("trino")
    const input = {
      adapters: [trino],
      dataSources: {
        warehouse: {
          adapter: "trino" as const,
          connection: { host: "localhost", port: 8080 },
        },
      },
    }

    const r1 = defineConfig(input)
    const r2 = defineConfig(input)

    expect(r1.dataSources).toStrictEqual(r2.dataSources)
  })

  it("preserves writeConfig identity through custom merge", () => {
    const writeConfigObj = { batchSize: 100, format: "parquet" }

    const trino = makeAdapterDefinition("trino", {
      mergeDataSourceConfig: (_regOpts, sourceConfig) => {
        const src = sourceConfig as {
          connection: unknown
          writeConfig?: unknown
        }
        return {
          connection: src.connection,
          writeConfig: src.writeConfig,
        }
      },
    })

    const result = defineConfig({
      adapters: [trino],
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost" },
          writeConfig: writeConfigObj,
        },
      },
    })

    expect(result.dataSources.warehouse!.writeConfig).toBe(writeConfigObj)
  })

  it("preserves per-source impersonationResolver identity", () => {
    const trino = makeAdapterDefinition("trino")

    const result = defineConfig({
      adapters: [trino],
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost" },
          impersonationResolver: sampleImpersonationResolver,
        },
      },
    })

    expect(result.dataSources.warehouse!.impersonationResolver).toBe(
      sampleImpersonationResolver
    )
  })

  it("omits impersonationResolver when not provided", () => {
    const trino = makeAdapterDefinition("trino")

    const result = defineConfig({
      adapters: [trino],
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost" },
        },
      },
    })

    expect(result.dataSources.warehouse).not.toHaveProperty(
      "impersonationResolver"
    )
  })

  it("preserves connection identity through custom merge that passes it through", () => {
    const connectionObj = { host: "localhost", port: 8080 }

    const trino = makeAdapterDefinition("trino", {
      mergeDataSourceConfig: (_regOpts, sourceConfig) => {
        const src = sourceConfig as {
          connection: unknown
          writeConfig?: unknown
        }
        return {
          connection: src.connection,
        }
      },
    })

    const result = defineConfig({
      adapters: [trino],
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: connectionObj,
        },
      },
    })

    expect(result.dataSources.warehouse!.connection).toBe(connectionObj)
  })
})
