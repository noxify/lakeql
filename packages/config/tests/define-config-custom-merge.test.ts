// oxlint-disable typescript/no-explicit-any
// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable eslint/prefer-destructuring

import { describe, expect, it, vi } from "vitest"

import { DataSourceConfigError, defineConfig } from "../src/index"

/**
 * Creates a minimal adapter definition with a custom mergeDataSourceConfig function.
 */
function makeAdapterWithMerge(
  name: string,
  opts: {
    registrationOptions?: unknown
    mergeFn: (regOpts: unknown, sourceConfig: unknown) => unknown
    validateFn?: (config: unknown) => void
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
    registrationOptions: opts.registrationOptions,
    mergeDataSourceConfig: opts.mergeFn,
    validateDataSourceConfig: opts.validateFn ?? (() => {}),
  } as unknown
}

describe("defineConfig() - custom merge function", () => {
  it("mergeDataSourceConfig is called with (registrationOptions, { connection, writeConfig, overrides })", () => {
    const regOpts = { timeout: 30 }
    const mergeFn = vi
      .fn<(r: unknown, s: unknown) => unknown>()
      .mockReturnValue({ connection: { merged: true } })

    const adapter = makeAdapterWithMerge("trino", {
      registrationOptions: regOpts,
      mergeFn,
    })

    defineConfig({
      adapters: [adapter] as any,
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost" },
          writeConfig: { batchSize: 100 },
          overrides: { timeout: 5 },
        },
      } as any,
    })

    expect(mergeFn).toHaveBeenCalledExactlyOnceWith(regOpts, {
      connection: { host: "localhost" },
      writeConfig: { batchSize: 100 },
      overrides: { timeout: 5 },
    })
  })

  it("merged result connection is passed to validateDataSourceConfig", () => {
    const mergedConnection = { host: "merged.host", port: 8080 }
    const validateFn = vi.fn<(c: unknown) => void>()

    const adapter = makeAdapterWithMerge("trino", {
      mergeFn: () => ({ connection: mergedConnection }),
      validateFn,
    })

    defineConfig({
      adapters: [adapter] as any,
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "original" },
        },
      } as any,
    })

    expect(validateFn).toHaveBeenCalledExactlyOnceWith(mergedConnection)
  })

  it("custom merge owns the entire merge — default merge is skipped", () => {
    // Use a function in registrationOptions — this would throw in the default
    // merge path because functions are opaque values
    const opaqueRegOpts = { callback: () => "opaque" }

    const adapter = makeAdapterWithMerge("trino", {
      registrationOptions: opaqueRegOpts,
      mergeFn: (_regOpts, _sourceConfig) => ({
        connection: { handled: true },
      }),
    })

    // Should NOT throw because the custom merge handles the opaque value
    expect(() =>
      defineConfig({
        adapters: [adapter] as any,
        dataSources: {
          warehouse: {
            adapter: "trino",
            connection: { host: "localhost" },
          },
        } as any,
      })
    ).not.toThrow()
  })

  it("merge function exception wraps in DataSourceConfigError with cause", () => {
    const originalError = new Error("merge failed")

    const adapter = makeAdapterWithMerge("trino", {
      mergeFn: () => {
        throw originalError
      },
    })

    try {
      defineConfig({
        adapters: [adapter] as any,
        dataSources: {
          warehouse: {
            adapter: "trino",
            connection: { host: "localhost" },
          },
        } as any,
      })
      expect.fail("Expected defineConfig to throw")
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DataSourceConfigError)
      const dsError = error as DataSourceConfigError
      expect(dsError.sourceName).toBe("warehouse")
      expect(dsError.adapterName).toBe("trino")
      expect(dsError.cause).toBe(originalError)
    }
  })

  it("undefined registrationOptions passed as-is (not empty record)", () => {
    const mergeFn = vi
      .fn<(r: unknown, s: unknown) => unknown>()
      .mockReturnValue({ connection: {} })

    const adapter = makeAdapterWithMerge("trino", {
      // No registrationOptions set — should be undefined
      mergeFn,
    })

    defineConfig({
      adapters: [adapter] as any,
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost" },
        },
      } as any,
    })

    expect(mergeFn).toHaveBeenCalledOnce()
    // First argument is registrationOptions — should be undefined, not {}
    const [firstArg] = mergeFn.mock.calls[0]!
    expect(firstArg).toBeUndefined()
  })

  it("undefined overrides not included in sourceConfig", () => {
    const mergeFn = vi
      .fn<(r: unknown, s: unknown) => unknown>()
      .mockReturnValue({ connection: {} })

    const adapter = makeAdapterWithMerge("trino", {
      registrationOptions: { timeout: 30 },
      mergeFn,
    })

    defineConfig({
      adapters: [adapter] as any,
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost" },
          // No overrides specified
        },
      } as any,
    })

    expect(mergeFn).toHaveBeenCalledOnce()
    const sourceConfig = mergeFn.mock.calls[0]![1] as Record<string, unknown>
    // overrides key should not be present when not specified
    expect(sourceConfig).not.toHaveProperty("overrides")
  })

  it("custom merge can transform writeConfig; transformed value appears in normalized output", () => {
    const adapter = makeAdapterWithMerge("trino", {
      mergeFn: (_regOpts, _sourceConfig) => ({
        connection: { host: "merged" },
        writeConfig: { transformed: true, batchSize: 500 },
      }),
    })

    const result = defineConfig({
      adapters: [adapter] as any,
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "original" },
          writeConfig: { batchSize: 100 },
        },
      } as any,
    })

    expect(result.dataSources.warehouse!.writeConfig).toStrictEqual({
      transformed: true,
      batchSize: 500,
    })
  })

  it("validator only receives connection, not writeConfig, even when custom merge transforms both", () => {
    const mergedConnection = { host: "merged" }
    const mergedWriteConfig = { transformed: true }
    const validateFn = vi.fn<(c: unknown) => void>()

    const adapter = makeAdapterWithMerge("trino", {
      mergeFn: () => ({
        connection: mergedConnection,
        writeConfig: mergedWriteConfig,
      }),
      validateFn,
    })

    defineConfig({
      adapters: [adapter] as any,
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "original" },
          writeConfig: { batchSize: 100 },
        },
      } as any,
    })

    expect(validateFn).toHaveBeenCalledExactlyOnceWith(mergedConnection)
    // It should NOT have received the full merged result or writeConfig
    const validatorArg = validateFn.mock.calls[0]![0]
    expect(validatorArg).not.toHaveProperty("writeConfig")
    expect(validatorArg).toBe(mergedConnection)
  })
})
