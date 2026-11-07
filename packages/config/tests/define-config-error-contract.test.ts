// oxlint-disable typescript/no-explicit-any
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable vitest/max-expects

import { describe, expect, it } from "vitest"

import {
  AdapterNameMismatchError,
  DataSourceConfigError,
  DuplicateAdapterError,
  UnknownAdapterError,
  defineConfig,
} from "../src/index"

/**
 * Creates a minimal AdapterDefinition stub for testing error contract paths.
 */
function makeAdapterDefinition(
  name: string,
  opts?: {
    validateFn?: (config: unknown) => void
    mergeFn?: (regOpts: unknown, sourceConfig: unknown) => unknown
    registrationOptions?: unknown
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

describe("defineConfig() - stable public error contract", () => {
  describe("DuplicateAdapterError contract", () => {
    it("extends Error, has stable name, supports instanceof, and exposes adapterName", () => {
      const err = new DuplicateAdapterError("trino")

      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(DuplicateAdapterError)
      expect(err.name).toBe("DuplicateAdapterError")
      expect(err.adapterName).toBe("trino")
      expect(err.message).toContain("trino")
    })

    it("instanceof works against package root export", () => {
      const first = makeAdapterDefinition("trino")
      const second = makeAdapterDefinition("trino")

      try {
        defineConfig({ adapters: [first, second], dataSources: {} })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DuplicateAdapterError)
        expect((error as DuplicateAdapterError).adapterName).toBe("trino")
      }
    })
  })

  describe("AdapterNameMismatchError contract", () => {
    it("extends Error, has stable name, supports instanceof, and exposes both names", () => {
      const err = new AdapterNameMismatchError("def-name", "factory-name")

      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(AdapterNameMismatchError)
      expect(err.name).toBe("AdapterNameMismatchError")
      expect(err.definitionName).toBe("def-name")
      expect(err.factoryName).toBe("factory-name")
      expect(err.message).toContain("def-name")
      expect(err.message).toContain("factory-name")
    })

    it("instanceof works against package root export", () => {
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
        defineConfig({ adapters: [mismatched], dataSources: {} })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(AdapterNameMismatchError)
        const mismatchErr = error as AdapterNameMismatchError
        expect(mismatchErr.definitionName).toBe("trino")
        expect(mismatchErr.factoryName).toBe("fabric")
      }
    })
  })

  describe("UnknownAdapterError contract", () => {
    it("extends Error, has stable name, supports instanceof, and exposes fields", () => {
      const err = new UnknownAdapterError("missing", ["trino", "fabric"])

      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(UnknownAdapterError)
      expect(err.name).toBe("UnknownAdapterError")
      expect(err.adapterName).toBe("missing")
      expect(err.registeredAdapterNames).toStrictEqual(["trino", "fabric"])
      expect(err.message).toContain("missing")
    })

    it("instanceof works against package root export when thrown as cause", () => {
      const trino = makeAdapterDefinition("trino")

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            warehouse: { adapter: "unknown-adapter", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.cause).toBeInstanceOf(UnknownAdapterError)
        const cause = dsError.cause as UnknownAdapterError
        expect(cause.adapterName).toBe("unknown-adapter")
        expect(cause.registeredAdapterNames).toContain("trino")
      }
    })
  })

  describe("DataSourceConfigError contract", () => {
    it("extends Error, has stable name, supports instanceof, and exposes fields", () => {
      const cause = new Error("validation failed")
      const err = new DataSourceConfigError(
        "source failed",
        "mySource",
        "trino",
        cause
      )

      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(DataSourceConfigError)
      expect(err.name).toBe("DataSourceConfigError")
      expect(err.sourceName).toBe("mySource")
      expect(err.adapterName).toBe("trino")
      expect(err.cause).toBe(cause)
      expect(err.message).toBe("source failed")
    })

    it("supports undefined adapterName", () => {
      const err = new DataSourceConfigError(
        "source failed",
        "mySource",
        undefined,
        null
      )

      expect(err).toBeInstanceOf(DataSourceConfigError)
      expect(err.adapterName).toBeUndefined()
      expect(err.cause).toBeNull()
    })
  })

  describe("DataSourceConfigError.cause preservation across wrapping paths", () => {
    it("preserves cause from validation failure", () => {
      const validationError = new TypeError("host is required")
      const adapter = makeAdapterDefinition("trino", {
        validateFn: () => {
          throw validationError
        },
      })

      try {
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: { adapter: "trino", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.sourceName).toBe("warehouse")
        expect(dsError.adapterName).toBe("trino")
        expect(dsError.cause).toBe(validationError)
      }
    })

    it("preserves cause from custom merge failure", () => {
      const mergeError = new RangeError("invalid merge")
      const adapter = makeAdapterDefinition("trino", {
        mergeFn: () => {
          throw mergeError
        },
      })

      try {
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: { adapter: "trino", connection: { host: "localhost" } },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.sourceName).toBe("warehouse")
        expect(dsError.cause).toBe(mergeError)
      }
    })

    it("preserves UnknownAdapterError as cause for unknown adapter reference", () => {
      const trino = makeAdapterDefinition("trino")

      try {
        defineConfig({
          adapters: [trino],
          dataSources: {
            warehouse: { adapter: "nonexistent", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.sourceName).toBe("warehouse")
        expect(dsError.adapterName).toBeUndefined()
        expect(dsError.cause).toBeInstanceOf(UnknownAdapterError)
      }
    })

    it("preserves cause for opaque value detection in default merge path", () => {
      const adapter = makeAdapterDefinition("trino", {
        registrationOptions: { callback: () => {} },
      })

      try {
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: { adapter: "trino", connection: { host: "localhost" } },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.sourceName).toBe("warehouse")
        expect(dsError.adapterName).toBe("trino")
      }
    })

    it("preserves non-Error cause values without normalization", () => {
      const adapter = makeAdapterDefinition("trino", {
        validateFn: () => {
          // eslint-disable-next-line no-throw-literal
          throw "string error"
        },
      })

      try {
        defineConfig({
          adapters: [adapter],
          dataSources: {
            warehouse: { adapter: "trino", connection: {} },
          },
        })
        expect.fail("should have thrown")
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DataSourceConfigError)
        const dsError = error as DataSourceConfigError
        expect(dsError.cause).toBe("string error")
      }
    })
  })
})
