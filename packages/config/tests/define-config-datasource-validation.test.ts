// oxlint-disable typescript/no-explicit-any
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable eslint/no-throw-literal
// oxlint-disable unicorn/consistent-function-scoping

import { describe, expect, it, vi } from "vitest"

import {
  DataSourceConfigError,
  UnknownAdapterError,
  defineConfig,
} from "../src/index"

/**
 * Creates a minimal AdapterDefinition stub for testing data-source
 * validation paths.
 */
function makeAdapterDefinition(
  name: string,
  opts?: { validateFn?: (config: unknown) => void }
) {
  return {
    adapterName: name,
    factory: {
      adapterName: name,
      createDataSource: () => {},
      createReadStrategy: () => {},
      createWriteStrategy: () => {},
    },
    validateDataSourceConfig: opts?.validateFn ?? (() => {}),
  } as any
}

describe("defineConfig() - data-source validation and unknown adapter", () => {
  describe("unknown adapter reference", () => {
    it("throws DataSourceConfigError with UnknownAdapterError as cause", () => {
      const trino = makeAdapterDefinition("trino")

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            warehouse: { adapter: "missing", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.cause).toBeInstanceOf(UnknownAdapterError)
      }
    })

    it("cause carries adapterName and registeredAdapterNames", () => {
      const trino = makeAdapterDefinition("trino")

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            warehouse: { adapter: "missing", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        const dsError = error as DataSourceConfigError
        const cause = dsError.cause as UnknownAdapterError
        expect(cause.adapterName).toBe("missing")
        expect(cause.registeredAdapterNames).toContain("trino")
      }
    })

    it("outer error adapterName is undefined for unknown adapter", () => {
      const trino = makeAdapterDefinition("trino")

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            warehouse: { adapter: "missing", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        const dsError = error as DataSourceConfigError
        expect(dsError.adapterName).toBeUndefined()
      }
    })
  })

  describe("validateDataSourceConfig invocation", () => {
    it("is called exactly once with merged connection only", () => {
      const validateFn = vi.fn<(config: unknown) => void>()
      const trino = makeAdapterDefinition("trino", { validateFn })

      defineConfig({
        adapters: [trino],
        dataSources: {
          warehouse: {
            adapter: "trino",
            connection: { host: "localhost", port: 8080 },
            writeConfig: { batchSize: 100 },
          },
        },
      })

      // Should receive the connection object only, not writeConfig
      expect(validateFn).toHaveBeenCalledExactlyOnceWith({
        host: "localhost",
        port: 8080,
      })
    })

    it("does not pass writeConfig to the validator", () => {
      const validateFn = vi.fn<(config: unknown) => void>()
      const trino = makeAdapterDefinition("trino", { validateFn })

      defineConfig({
        adapters: [trino],
        dataSources: {
          warehouse: {
            adapter: "trino",
            connection: { host: "db.local" },
            writeConfig: { mode: "append" },
          },
        },
      })

      const [receivedArg] = validateFn.mock.calls[0] ?? []
      expect(receivedArg).not.toHaveProperty("writeConfig")
      expect(receivedArg).not.toHaveProperty("mode")
    })
  })

  describe("validation failure wrapping", () => {
    it("wraps original Error in DataSourceConfigError", () => {
      const originalError = new Error("bad config")
      const validateFn = () => {
        throw originalError
      }
      const trino = makeAdapterDefinition("trino", { validateFn })

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            warehouse: { adapter: "trino", connection: { host: "x" } },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.sourceName).toBe("warehouse")
        expect(dsError.adapterName).toBe("trino")
        expect(dsError.cause).toBe(originalError)
      }
    })
  })

  describe("non-Error cause preserved unchanged", () => {
    it("preserves string cause via === identity", () => {
      const validateFn = () => {
        throw "string error"
      }
      const trino = makeAdapterDefinition("trino", { validateFn })

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            db: { adapter: "trino", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        const dsError = error as DataSourceConfigError
        expect(dsError.cause).toBe("string error")
      }
    })

    it("preserves null cause via === identity", () => {
      const validateFn = () => {
        throw null
      }
      const trino = makeAdapterDefinition("trino", { validateFn })

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            db: { adapter: "trino", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        const dsError = error as DataSourceConfigError
        expect(dsError.cause).toBeNull()
      }
    })

    it("preserves undefined cause via === identity", () => {
      const validateFn = () => {
        throw undefined
      }
      const trino = makeAdapterDefinition("trino", { validateFn })

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            db: { adapter: "trino", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        const dsError = error as DataSourceConfigError
        expect(dsError.cause).toBeUndefined()
      }
    })

    it("preserves number cause via === identity", () => {
      const validateFn = () => {
        throw 42
      }
      const trino = makeAdapterDefinition("trino", { validateFn })

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            db: { adapter: "trino", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        const dsError = error as DataSourceConfigError
        expect(dsError.cause).toBe(42)
      }
    })

    it("preserves symbol cause via === identity", () => {
      const sym = Symbol("s")
      const validateFn = () => {
        throw sym
      }
      const trino = makeAdapterDefinition("trino", { validateFn })

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            db: { adapter: "trino", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        const dsError = error as DataSourceConfigError
        expect(dsError.cause).toBe(sym)
      }
    })
  })
})
