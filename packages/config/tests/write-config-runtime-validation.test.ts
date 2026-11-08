// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable typescript/no-explicit-any

import { describe, expect, it, vi } from "vitest"

import type { AdapterDefinition } from "../src/index"
import { DataSourceConfigError, defineConfig } from "../src/index"

/**
 * Builds a minimal adapter definition. When `validateWriteConfig` is provided,
 * it is attached so `processDataSources` invokes it. An optional
 * `mergeDataSourceConfig` exercises the custom-merge path.
 */
function makeAdapter(options: {
  name?: string
  validateWriteConfig?: (config: unknown) => void
  validateDataSourceConfig?: (config: unknown) => void
  mergeDataSourceConfig?: (
    regOpts: unknown,
    sourceConfig: unknown
  ) => { connection: unknown; writeConfig?: unknown }
}) {
  const def: Record<string, unknown> = {
    adapterName: options.name ?? "trino",
    factory: {
      adapterName: options.name ?? "trino",
      createDataSource: () => {},
      createReadStrategy: () => {},
      createWriteStrategy: () => {},
    },
    validateDataSourceConfig: options.validateDataSourceConfig ?? (() => {}),
  }

  if (options.validateWriteConfig) {
    def.validateWriteConfig = options.validateWriteConfig
  }
  if (options.mergeDataSourceConfig) {
    def.mergeDataSourceConfig = options.mergeDataSourceConfig
  }

  return def as unknown as AdapterDefinition<string, unknown, unknown, unknown>
}

describe("processDataSources() writeConfig validation", () => {
  it("R1: rejects an invalid writeConfig with DataSourceConfigError", () => {
    const cause = new Error("bad strategy")
    const adapter = makeAdapter({
      name: "trino",
      validateWriteConfig: () => {
        throw cause
      },
    })

    let thrown: unknown
    try {
      defineConfig({
        adapters: [adapter],
        dataSources: {
          warehouse: {
            adapter: "trino",
            connection: { host: "localhost" },
            writeConfig: { strategy: "copy" } as never,
          },
        },
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(DataSourceConfigError)
    const err = thrown as DataSourceConfigError
    expect(err.sourceName).toBe("warehouse")
    expect(err.adapterName).toBe("trino")
    expect(err.cause).toBe(cause)
    expect(err.message).toContain("writeConfig")
  })

  it("R2: preserves a valid writeConfig by reference", () => {
    const writeConfigRef = { strategy: "insert", batchSize: 10 }
    const validate = vi.fn<(config: unknown) => void>(() => {})
    const adapter = makeAdapter({
      name: "trino",
      validateWriteConfig: validate,
    })

    const result = defineConfig({
      adapters: [adapter],
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost" },
          writeConfig: writeConfigRef as never,
        },
      },
    })

    expect(validate).toHaveBeenCalledExactlyOnceWith(writeConfigRef)
    expect(result.dataSources.warehouse!.writeConfig).toBe(writeConfigRef)
  })

  it("R3: does not validate when the adapter declares no validateWriteConfig", () => {
    const adapter = makeAdapter({ name: "trino" })

    const result = defineConfig({
      adapters: [adapter],
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost" },
          writeConfig: { anything: true } as never,
        },
      },
    })

    expect(result.dataSources.warehouse!.writeConfig).toStrictEqual({
      anything: true,
    })
  })

  it("R3: does not invoke validateWriteConfig when writeConfig is absent", () => {
    const validate = vi.fn<(config: unknown) => void>(() => {})
    const adapter = makeAdapter({
      name: "trino",
      validateWriteConfig: validate,
    })

    const result = defineConfig({
      adapters: [adapter],
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: { host: "localhost" },
        },
      },
    })

    expect(validate).not.toHaveBeenCalled()
    expect(result.dataSources.warehouse!.writeConfig).toBeUndefined()
  })

  it("R4: connection validation error takes priority over writeConfig", () => {
    const connError = new Error("bad connection")
    const writeValidate = vi.fn<(config: unknown) => void>(() => {
      throw new Error("bad writeConfig")
    })
    const adapter = makeAdapter({
      name: "trino",
      validateDataSourceConfig: () => {
        throw connError
      },
      validateWriteConfig: writeValidate,
    })

    let thrown: unknown
    try {
      defineConfig({
        adapters: [adapter],
        dataSources: {
          warehouse: {
            adapter: "trino",
            connection: { host: "localhost" },
            writeConfig: { strategy: "insert" } as never,
          },
        },
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(DataSourceConfigError)
    expect((thrown as DataSourceConfigError).cause).toBe(connError)
    expect(writeValidate).not.toHaveBeenCalled()
  })

  it("R4: validates the post-merge writeConfig from a custom merge", () => {
    const mergedWriteConfig = { strategy: "insert", fromMerge: true }
    const validate = vi.fn<(config: unknown) => void>((config) => {
      if ((config as { fromMerge?: boolean }).fromMerge) {
        throw new Error("merged writeConfig rejected")
      }
    })
    const adapter = makeAdapter({
      name: "trino",
      validateWriteConfig: validate,
      mergeDataSourceConfig: (_regOpts, sourceConfig) => {
        const src = sourceConfig as { connection: unknown }
        return { connection: src.connection, writeConfig: mergedWriteConfig }
      },
    })

    let thrown: unknown
    try {
      defineConfig({
        adapters: [adapter],
        dataSources: {
          warehouse: {
            adapter: "trino",
            connection: { host: "localhost" },
            // No writeConfig on input; the custom merge injects one.
          },
        },
      })
    } catch (error) {
      thrown = error
    }

    expect(validate).toHaveBeenCalledWith(mergedWriteConfig)
    expect(thrown).toBeInstanceOf(DataSourceConfigError)
    expect((thrown as DataSourceConfigError).message).toContain("writeConfig")
  })
})
