// oxlint-disable vitest/no-conditional-expect, vitest/require-to-throw-message

import type { AdapterFactory } from "@lakeql/datasource"
import { FakeAdapterFactory } from "@lakeql/datasource/testing"
import { describe, expect, it } from "vitest"

import type { AdapterDefinition } from "../src/index"
import {
  AdapterNameMismatchError,
  DuplicateAdapterError,
  defineConfig,
} from "../src/index"

/**
 * Creates a minimal AdapterDefinition stub with a custom adapter name.
 * Reuses the FakeAdapterFactory method implementations for all factory methods.
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

describe("defineConfig() - adapter registration validation", () => {
  it("accepts a valid single adapter", () => {
    const trino = makeAdapterDefinition("trino")

    const result = defineConfig({
      adapters: [trino],
      dataSources: {},
    })

    expect(result.adapters).toHaveLength(1)
    expect(result.adapters[0]).toBe(trino)
  })

  it("accepts valid multiple adapters with different names", () => {
    const trino = makeAdapterDefinition("trino")
    const fabric = makeAdapterDefinition("fabric")

    const result = defineConfig({
      adapters: [trino, fabric],
      dataSources: {},
    })

    expect(result.adapters).toHaveLength(2)
    expect(result.adapters[0]).toBe(trino)
    expect(result.adapters[1]).toBe(fabric)
  })

  it("throws DuplicateAdapterError for duplicate adapter names", () => {
    const first = makeAdapterDefinition("trino")
    const second = makeAdapterDefinition("trino")

    expect(() =>
      defineConfig({
        adapters: [first, second],
        dataSources: {},
      })
    ).toThrow(DuplicateAdapterError)

    try {
      defineConfig({
        adapters: [first, second],
        dataSources: {},
      })
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DuplicateAdapterError)
      const dupError = error as DuplicateAdapterError
      expect(dupError.adapterName).toBe("trino")
    }
  })

  it("throws AdapterNameMismatchError when definition name differs from factory name", () => {
    const base = new FakeAdapterFactory()
    const mismatched = {
      adapterName: "trino",
      factory: {
        adapterName: "fabric",
        createDataSource: base.createDataSource.bind(base),
        createReadStrategy: base.createReadStrategy.bind(base),
        createWriteStrategy: base.createWriteStrategy.bind(base),
      } as AdapterFactory,
      validateDataSourceConfig: () => {},
    } as unknown as AdapterDefinition<string, unknown>

    expect(() =>
      defineConfig({
        adapters: [mismatched],
        dataSources: {},
      })
    ).toThrow(AdapterNameMismatchError)

    try {
      defineConfig({
        adapters: [mismatched],
        dataSources: {},
      })
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AdapterNameMismatchError)
      const mismatchError = error as AdapterNameMismatchError
      expect(mismatchError.definitionName).toBe("trino")
      expect(mismatchError.factoryName).toBe("fabric")
    }
  })

  it("accepts an empty adapters array (empty but runnable config)", () => {
    const result = defineConfig({
      adapters: [],
      dataSources: {},
    })

    expect(result.adapters).toStrictEqual([])
    expect(result.dataSources).toStrictEqual({})
  })

  it("throws for empty adapter name string", () => {
    const base = new FakeAdapterFactory()
    const emptyName = {
      adapterName: "",
      factory: {
        adapterName: "",
        createDataSource: base.createDataSource.bind(base),
        createReadStrategy: base.createReadStrategy.bind(base),
        createWriteStrategy: base.createWriteStrategy.bind(base),
      } as AdapterFactory,
      validateDataSourceConfig: () => {},
    } as unknown as AdapterDefinition<string, unknown>

    expect(() =>
      defineConfig({
        adapters: [emptyName],
        dataSources: {},
      })
    ).toThrow()
  })
})
