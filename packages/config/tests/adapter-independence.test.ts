// oxlint-disable typescript/no-explicit-any
// oxlint-disable typescript/no-non-null-assertion

/**
 * Adapter package independence test.
 *
 * This test INTENTIONALLY does NOT import AdapterDefinition, DataSourceConfigInput,
 * or MergedDataSourceConfig from @lakeql/config to prove that adapter packages can
 * function using only @lakeql/datasource types and structurally compatible local types.
 */

import type { AdapterFactory } from "@lakeql/datasource"
import { FakeAdapterFactory } from "@lakeql/datasource/testing"
import { describe, expect, it } from "vitest"

import { DataSourceConfigError, defineConfig } from "../src/index"

/**
 * Creates an AdapterFactory stub with a specific adapter name.
 * Reuses FakeAdapterFactory method implementations.
 */
function makeFactory(name: string): AdapterFactory {
  const base = new FakeAdapterFactory()
  return {
    adapterName: name,
    createDataSource: base.createDataSource.bind(base),
    createReadStrategy: base.createReadStrategy.bind(base),
    createWriteStrategy: base.createWriteStrategy.bind(base),
  }
}

describe("Adapter package independence", () => {
  it("adapter can be defined using only @lakeql/datasource types", () => {
    // Define local types that are structurally compatible — no config package imports
    interface MyConnection {
      host: string
      port: number
    }

    const factory = makeFactory("my-adapter")

    // This adapter definition uses ONLY AdapterFactory from @lakeql/datasource
    // and its own local types. No AdapterDefinition import from @lakeql/config.
    const adapter = {
      adapterName: "my-adapter" as const,
      factory,
      validateDataSourceConfig(
        config: unknown
      ): asserts config is MyConnection {
        if (
          !config ||
          typeof config !== "object" ||
          !("host" in config) ||
          !("port" in config)
        ) {
          throw new Error("host and port required")
        }
      },
    }

    // Works with defineConfig without importing config-specific types
    const result = defineConfig({
      adapters: [adapter] as any,
      dataSources: {
        ds: {
          adapter: "my-adapter",
          connection: { host: "localhost", port: 8080 },
        },
      } as any,
    })

    expect(result.dataSources.ds!.connection).toStrictEqual({
      host: "localhost",
      port: 8080,
    })
    expect(result.adapters[0]).toBe(adapter)
  })

  it("validateDataSourceConfig is invocable without @lakeql/config dependency", () => {
    const factory = makeFactory("standalone")

    const adapter = {
      adapterName: "standalone" as const,
      factory,
      validateDataSourceConfig(
        config: unknown
      ): asserts config is { url: string } {
        if (!config || typeof config !== "object" || !("url" in config)) {
          throw new Error("url required")
        }
      },
    }

    // The adapter's validateDataSourceConfig can be called directly
    expect(() =>
      adapter.validateDataSourceConfig({ url: "http://test" })
    ).not.toThrow()
    expect(() => adapter.validateDataSourceConfig({})).toThrow("url required")
  })

  it("factory is usable without @lakeql/config as transitive dependency", () => {
    const factory = makeFactory("independent")

    // The factory can create data sources, read strategies, write strategies
    // without any config package involvement
    const ds = factory.createDataSource({ host: "test" }, "test-ds")
    expect(ds).toBeDefined()

    const readStrategy = factory.createReadStrategy({
      dataSource: ds,
      resolveAuth: async () => ({}),
    })
    expect(readStrategy).toBeDefined()
    expect(readStrategy.read).toBeTypeOf("function")
  })

  it("structurally compatible mergeDataSourceConfig works without importing config types", () => {
    const factory = makeFactory("custom-merge-adapter")

    // Define structurally compatible local types — NOT imported from @lakeql/config
    interface LocalConnection {
      host: string
      timeout: number
    }

    interface LocalRegistrationOptions {
      timeout: number
    }

    // This mergeDataSourceConfig uses local structural types, not DataSourceConfigInput
    // or MergedDataSourceConfig from @lakeql/config.
    const adapter = {
      adapterName: "custom-merge-adapter" as const,
      factory,
      registrationOptions: { timeout: 30 } as LocalRegistrationOptions,
      mergeDataSourceConfig(
        registrationOptions: LocalRegistrationOptions | undefined,
        sourceConfig: {
          connection: LocalConnection
          writeConfig?: unknown
          overrides?: Partial<LocalRegistrationOptions>
        }
      ): { connection: LocalConnection; writeConfig?: unknown } {
        const effectiveTimeout =
          sourceConfig.overrides?.timeout ?? registrationOptions?.timeout ?? 10
        return {
          connection: {
            host: sourceConfig.connection.host,
            timeout: effectiveTimeout,
          },
          writeConfig: sourceConfig.writeConfig,
        }
      },
      validateDataSourceConfig(
        config: unknown
      ): asserts config is LocalConnection {
        if (!config || typeof config !== "object" || !("host" in config)) {
          throw new Error("host required")
        }
      },
    }

    const result = defineConfig({
      adapters: [adapter] as any,
      dataSources: {
        ds: {
          adapter: "custom-merge-adapter",
          connection: { host: "localhost", timeout: 0 },
          overrides: { timeout: 5 },
        },
      } as any,
    })

    // The custom merge applied the override timeout
    expect(result.dataSources.ds!.connection).toStrictEqual({
      host: "localhost",
      timeout: 5,
    })
  })

  it("adapter functions fully without module augmentation", () => {
    // No `declare module "@lakeql/config"` augmentation exists or is loaded.
    // The adapter is passed directly in the adapters array — that is sufficient.
    const factory = makeFactory("no-augmentation")

    const adapter = {
      adapterName: "no-augmentation" as const,
      factory,
      validateDataSourceConfig(
        config: unknown
      ): asserts config is { key: string } {
        if (!config || typeof config !== "object" || !("key" in config)) {
          throw new Error("key required")
        }
      },
    }

    // defineConfig works purely via the explicit adapters array contract
    const result = defineConfig({
      adapters: [adapter] as any,
      dataSources: {
        primary: {
          adapter: "no-augmentation",
          connection: { key: "secret-123" },
        },
      } as any,
    })

    expect(result.dataSources.primary!.adapter).toBe("no-augmentation")
    expect(result.dataSources.primary!.connection).toStrictEqual({
      key: "secret-123",
    })
    expect(result.adapters).toHaveLength(1)
    expect(result.adapters[0]).toBe(adapter)
  })

  it("no global state: adapter not in one call is unknown in another", () => {
    const adapterA = {
      adapterName: "adapter-a" as const,
      factory: makeFactory("adapter-a"),
      validateDataSourceConfig: () => {},
    }
    const adapterB = {
      adapterName: "adapter-b" as const,
      factory: makeFactory("adapter-b"),
      validateDataSourceConfig: () => {},
    }

    // Register adapter-a in one call
    defineConfig({
      adapters: [adapterA] as any,
      dataSources: {
        ds1: { adapter: "adapter-a", connection: { x: 1 } },
      } as any,
    })

    // A separate call with only adapter-b cannot see adapter-a
    // This proves declare module augmentation does NOT auto-register adapters
    // and no global runtime state leaks between calls.
    expect(() =>
      defineConfig({
        adapters: [adapterB] as any,
        dataSources: {
          ds2: { adapter: "adapter-a", connection: { x: 1 } },
        } as any,
      })
    ).toThrow(DataSourceConfigError)

    // adapter-b works fine in its own scope
    const result = defineConfig({
      adapters: [adapterB] as any,
      dataSources: {
        ds2: { adapter: "adapter-b", connection: { y: 2 } },
      } as any,
    })

    expect(result.dataSources.ds2!.connection).toStrictEqual({ y: 2 })
  })

  it("removing a declare module augmentation file does not break adapter registration", () => {
    // Simulate the scenario: even if a module augmentation type file existed
    // and was removed, the adapter still works via the explicit contract.
    // The key assertion is that NO runtime mechanism depends on augmentation.

    const factory = makeFactory("augmented-before")

    // This adapter was previously "augmented" via declare module (simulated),
    // but now it only uses the explicit adapters array.
    const adapter = {
      adapterName: "augmented-before" as const,
      factory,
      registrationOptions: { poolSize: 10 },
      validateDataSourceConfig(
        config: unknown
      ): asserts config is { dsn: string } {
        if (!config || typeof config !== "object" || !("dsn" in config)) {
          throw new Error("dsn required")
        }
      },
    }

    // Works without any augmentation being present
    const result = defineConfig({
      adapters: [adapter] as any,
      dataSources: {
        myDs: {
          adapter: "augmented-before",
          connection: { dsn: "postgres://localhost/db", poolSize: 10 },
        },
      } as any,
    })

    expect(result.dataSources.myDs!.connection).toStrictEqual({
      dsn: "postgres://localhost/db",
      poolSize: 10,
    })
    expect(result.adapters[0]).toBe(adapter)
  })
})
