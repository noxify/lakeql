// oxlint-disable typescript/no-explicit-any
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable unicorn/consistent-function-scoping

import { describe, expect, it } from "vitest"

import {
  AdapterNameMismatchError,
  DataSourceConfigError,
  DuplicateAdapterError,
  UnknownAdapterError,
  defineConfig,
} from "../src/index"

/**
 * Creates a minimal adapter definition stub for testing.
 */
function makeAdapter(
  name: string,
  opts?: {
    registrationOptions?: unknown
    validateFn?: (config: unknown) => void
    mergeFn?: (regOpts: unknown, sourceConfig: unknown) => unknown
  }
) {
  return {
    adapterName: name,
    factory: {
      adapterName: name,
      createDataSource: () => {},
      createReadStrategy: () => {},
      createWriteStrategy: () => {},
    },
    registrationOptions: opts?.registrationOptions,
    mergeDataSourceConfig: opts?.mergeFn,
    validateDataSourceConfig: opts?.validateFn ?? (() => {}),
  } as any
}

/**
 * Invariant: ALL failures during processing of a named data source are
 * wrapped in DataSourceConfigError. Adapter-registration errors
 * (DuplicateAdapterError, AdapterNameMismatchError, empty-name TypeError)
 * are thrown directly, NOT wrapped.
 */
describe("defineConfig() - data-source failure wrapping invariant", () => {
  describe("data-source failures wrapped in DataSourceConfigError", () => {
    it("unknown adapter error wraps in DataSourceConfigError", () => {
      const trino = makeAdapter("trino")

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            warehouse: { adapter: "nonexistent", connection: {} },
          },
        })
        expect.fail("Expected defineConfig to throw")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        expect(error).not.toBeInstanceOf(UnknownAdapterError)
        const dsError = error as DataSourceConfigError
        expect(dsError.sourceName).toBe("warehouse")
        expect(dsError.cause).toBeInstanceOf(UnknownAdapterError)
      }
    })

    it("validation error wraps in DataSourceConfigError", () => {
      const validationError = new Error("host is required")
      const trino = makeAdapter("trino", {
        validateFn: () => {
          throw validationError
        },
      })

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            analytics: { adapter: "trino", connection: {} },
          },
        })
        expect.fail("Expected defineConfig to throw")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.sourceName).toBe("analytics")
        expect(dsError.cause).toBe(validationError)
      }
    })

    it("opaque-value error wraps in DataSourceConfigError", () => {
      const trino = makeAdapter("trino", {
        registrationOptions: { callback: () => "opaque" },
      })

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            mySource: { adapter: "trino", connection: { host: "x" } },
          },
        })
        expect.fail("Expected defineConfig to throw")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.sourceName).toBe("mySource")
      }
    })

    it("custom merge error wraps in DataSourceConfigError", () => {
      const mergeError = new Error("merge exploded")
      const trino = makeAdapter("trino", {
        mergeFn: () => {
          throw mergeError
        },
      })

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            reporting: { adapter: "trino", connection: { host: "r" } },
          },
        })
        expect.fail("Expected defineConfig to throw")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.sourceName).toBe("reporting")
        expect(dsError.cause).toBe(mergeError)
      }
    })

    it("invalid return from mergeDataSourceConfig (missing connection) wraps in DataSourceConfigError", () => {
      const trino = makeAdapter("trino", {
        mergeFn: () => ({ writeConfig: { batch: 10 } }),
      })

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            lake: { adapter: "trino", connection: { host: "lake" } },
          },
        })
        expect.fail("Expected defineConfig to throw")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.sourceName).toBe("lake")
        expect(dsError.adapterName).toBe("trino")
      }
    })
  })

  describe("adapter-registration errors thrown directly, NOT wrapped", () => {
    it("DuplicateAdapterError is thrown directly, not wrapped in DataSourceConfigError", () => {
      const first = makeAdapter("trino")
      const second = makeAdapter("trino")

      try {
        defineConfig({
          adapters: [first, second],
          dataSources: {},
        })
        expect.fail("Expected defineConfig to throw")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DuplicateAdapterError)
        expect(error).not.toBeInstanceOf(DataSourceConfigError)
      }
    })

    it("AdapterNameMismatchError is thrown directly, not wrapped in DataSourceConfigError", () => {
      const mismatched = {
        adapterName: "trino",
        factory: {
          adapterName: "fabric",
          createDataSource: () => {},
          createReadStrategy: () => {},
          createWriteStrategy: () => {},
        },
        validateDataSourceConfig: () => {},
      } as any

      try {
        defineConfig({
          adapters: [mismatched],
          dataSources: {},
        })
        expect.fail("Expected defineConfig to throw")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(AdapterNameMismatchError)
        expect(error).not.toBeInstanceOf(DataSourceConfigError)
      }
    })

    it("empty-name rejection is thrown directly as TypeError, not wrapped in DataSourceConfigError", () => {
      const emptyName = {
        adapterName: "",
        factory: {
          adapterName: "",
          createDataSource: () => {},
          createReadStrategy: () => {},
          createWriteStrategy: () => {},
        },
        validateDataSourceConfig: () => {},
      } as any

      try {
        defineConfig({
          adapters: [emptyName],
          dataSources: {},
        })
        expect.fail("Expected defineConfig to throw")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(TypeError)
        expect(error).not.toBeInstanceOf(DataSourceConfigError)
      }
    })
  })
})
