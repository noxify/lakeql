// oxlint-disable vitest/no-conditional-expect
// oxlint-disable eslint/max-classes-per-file
// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable typescript/no-explicit-any

import { describe, expect, it } from "vitest"

import type { AdapterDefinition } from "../src/index"
import { DataSourceConfigError, defineConfig } from "../src/index"

/**
 * Creates a minimal AdapterDefinition with optional registrationOptions.
 * Uses the default merge path (no mergeDataSourceConfig declared).
 */
function makeAdapterWithOptions(name: string, registrationOptions?: unknown) {
  return {
    adapterName: name,
    factory: {
      adapterName: name,
      createDataSource: () => {},
      createReadStrategy: () => {},
      createWriteStrategy: () => {},
    },
    registrationOptions,
    validateDataSourceConfig: () => {},
    // Widen TWriteConfig to unknown so this fixture's entries can carry a
    // writeConfig value; the pass-through test asserts runtime behavior, not
    // per-adapter write typing.
  } as unknown as AdapterDefinition<string, unknown, unknown, unknown>
}

describe("defineConfig() - default merge and opaque value detection", () => {
  describe("shallow merge precedence", () => {
    it("merges registrationOptions -> connection -> overrides in correct order", () => {
      const adapter = makeAdapterWithOptions("trino", { a: 1, b: 2 })

      const result = defineConfig({
        adapters: [adapter],
        dataSources: {
          warehouse: {
            adapter: "trino",
            connection: { b: 3, c: 4 },
            overrides: { c: 5 },
          },
        },
      })

      expect(result.dataSources.warehouse!.connection).toStrictEqual({
        a: 1,
        b: 3,
        c: 5,
      })
    })

    it("treats missing registrationOptions as empty", () => {
      const adapter = makeAdapterWithOptions("trino")

      const result = defineConfig({
        adapters: [adapter],
        dataSources: {
          warehouse: {
            adapter: "trino",
            connection: { host: "localhost", port: 8080 },
            overrides: { port: 9090 },
          },
        },
      })

      expect(result.dataSources.warehouse!.connection).toStrictEqual({
        host: "localhost",
        port: 9090,
      })
    })

    it("treats missing overrides as empty", () => {
      const adapter = makeAdapterWithOptions("trino", { timeout: 30 })

      const result = defineConfig({
        adapters: [adapter],
        dataSources: {
          warehouse: {
            adapter: "trino",
            connection: { host: "localhost" },
          },
        },
      })

      expect(result.dataSources.warehouse!.connection).toStrictEqual({
        timeout: 30,
        host: "localhost",
      })
    })

    it("passes writeConfig through unchanged", () => {
      const writeConfigRef = { mode: "batch", batchSize: 100 }
      const adapter = makeAdapterWithOptions("trino")

      const result = defineConfig({
        adapters: [adapter],
        dataSources: {
          warehouse: {
            adapter: "trino",
            connection: { host: "localhost" },
            writeConfig: writeConfigRef,
          },
        },
      })

      expect(result.dataSources.warehouse!.writeConfig).toBe(writeConfigRef)
    })
  })

  describe("opaque value detection", () => {
    it("throws DataSourceConfigError for function in registrationOptions", () => {
      const adapter = makeAdapterWithOptions("trino", {
        onConnect: () => {},
      })

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: { host: "localhost" },
            },
          },
        })
      ).toThrow(DataSourceConfigError)
    })

    it("throws DataSourceConfigError for class instance in connection", () => {
      class MyClient {
        host = "localhost"
      }

      const adapter = makeAdapterWithOptions("trino")

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: { client: new MyClient() },
            },
          },
        })
      ).toThrow(DataSourceConfigError)
    })

    it("throws DataSourceConfigError for opaque value in overrides", () => {
      const adapter = makeAdapterWithOptions("trino", { handler: "default" })

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: { host: "localhost" },
              overrides: { handler: () => "custom" },
            },
          },
        })
      ).toThrow(DataSourceConfigError)
    })

    it("error message identifies the field containing the opaque value", () => {
      const adapter = makeAdapterWithOptions("trino", {
        onConnect: () => {},
      })

      try {
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: { host: "localhost" },
            },
          },
        })
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const configError = error as DataSourceConfigError
        expect(configError.message).toContain("registrationOptions.onConnect")
        expect(configError.sourceName).toBe("warehouse")
        return
      }

      expect.fail("Expected DataSourceConfigError to be thrown")
    })

    it("error message identifies nested opaque field in connection", () => {
      class SecretStore {
        value = "secret"
      }

      const adapter = makeAdapterWithOptions("trino")

      try {
        defineConfig({
          adapters: [adapter],
          dataSources: {
            analytics: {
              adapter: "trino",
              connection: { secrets: new SecretStore() },
            },
          },
        })
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const configError = error as DataSourceConfigError
        expect(configError.message).toContain("connection.secrets")
        expect(configError.sourceName).toBe("analytics")
        return
      }

      expect.fail("Expected DataSourceConfigError to be thrown")
    })
  })
})

describe("defineConfig() - non-record root value rejection and TypeError causes", () => {
  describe("non-record root value rejection", () => {
    it("throws DataSourceConfigError when connection is null", () => {
      const adapter = makeAdapterWithOptions("trino")

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: null,
            },
          },
        } as any)
      ).toThrow(DataSourceConfigError)
    })

    it("throws DataSourceConfigError when connection is a string", () => {
      const adapter = makeAdapterWithOptions("trino")

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: "jdbc:trino://localhost:8080",
            },
          },
        } as any)
      ).toThrow(DataSourceConfigError)
    })

    it("throws DataSourceConfigError when connection is a number", () => {
      const adapter = makeAdapterWithOptions("trino")

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: 42,
            },
          },
        } as any)
      ).toThrow(DataSourceConfigError)
    })

    it("throws DataSourceConfigError when connection is a boolean", () => {
      const adapter = makeAdapterWithOptions("trino")

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: true,
            },
          },
        } as any)
      ).toThrow(DataSourceConfigError)
    })

    it("throws DataSourceConfigError when connection is an array", () => {
      const adapter = makeAdapterWithOptions("trino")

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: [{ host: "localhost" }],
            },
          },
        } as any)
      ).toThrow(DataSourceConfigError)
    })

    it("throws DataSourceConfigError when registrationOptions is a non-record primitive", () => {
      const adapter = {
        adapterName: "trino",
        factory: {
          adapterName: "trino",
          createDataSource: () => {},
          createReadStrategy: () => {},
          createWriteStrategy: () => {},
        },
        registrationOptions: "not-a-record",
        validateDataSourceConfig: () => {},
      } as any

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: { host: "localhost" },
            },
          },
        })
      ).toThrow(DataSourceConfigError)
    })

    it("throws DataSourceConfigError when overrides is a non-record primitive", () => {
      const adapter = makeAdapterWithOptions("trino")

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: { host: "localhost" },
              overrides: 99,
            },
          },
        } as any)
      ).toThrow(DataSourceConfigError)
    })

    it("throws DataSourceConfigError when registrationOptions is null", () => {
      const adapter = {
        adapterName: "trino",
        factory: {
          adapterName: "trino",
          createDataSource: () => {},
          createReadStrategy: () => {},
          createWriteStrategy: () => {},
        },
        registrationOptions: null,
        validateDataSourceConfig: () => {},
      } as any

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: { host: "localhost" },
            },
          },
        })
      ).toThrow(DataSourceConfigError)
    })

    it("throws DataSourceConfigError when overrides is null", () => {
      const adapter = makeAdapterWithOptions("trino")

      expect(() =>
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: { host: "localhost" },
              overrides: null,
            },
          },
        } as any)
      ).toThrow(DataSourceConfigError)
    })
  })

  describe("TypeError causes", () => {
    it("cause is a TypeError for non-record rejection", () => {
      const adapter = makeAdapterWithOptions("trino")

      try {
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: "not-a-record",
            },
          },
        } as any)
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const configError = error as DataSourceConfigError
        expect(configError.cause).toBeInstanceOf(TypeError)
        expect(configError.sourceName).toBe("warehouse")
        expect(configError.message).toContain("connection")
        return
      }

      expect.fail("Expected DataSourceConfigError to be thrown")
    })

    it("cause is a TypeError for opaque-value rejection", () => {
      const adapter = makeAdapterWithOptions("trino", {
        onConnect: () => {},
      })

      try {
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: {
              adapter: "trino",
              connection: { host: "localhost" },
            },
          },
        })
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const configError = error as DataSourceConfigError
        expect(configError.cause).toBeInstanceOf(TypeError)
        expect(configError.sourceName).toBe("warehouse")
        return
      }

      expect.fail("Expected DataSourceConfigError to be thrown")
    })
  })
})
