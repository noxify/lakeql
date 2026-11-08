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

/** Helper to capture the thrown error from a function call. */
function catchError(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error: unknown) {
    return error
  }
  return undefined
}

describe("defineConfig() - deterministic error ordering", () => {
  it("first invalid adapter in registration order causes error (not second)", () => {
    const valid = makeAdapterDefinition("trino")
    const firstDuplicate = makeAdapterDefinition("trino")
    const secondDuplicate = makeAdapterDefinition("trino")

    const thrown = catchError(() =>
      defineConfig({
        adapters: [valid, firstDuplicate, secondDuplicate],
        dataSources: {},
      })
    )

    expect(thrown).toBeInstanceOf(DuplicateAdapterError)
    expect((thrown as DuplicateAdapterError).adapterName).toBe("trino")
  })

  it("adapter errors are thrown before data-source errors", () => {
    const valid = makeAdapterDefinition("trino")
    const duplicate = makeAdapterDefinition("trino")

    // Both a duplicate adapter AND a data source referencing an unknown adapter
    const thrown = catchError(() =>
      defineConfig({
        adapters: [valid, duplicate],
        dataSources: {
          mySource: {
            adapter: "nonexistent",
            connection: {},
          },
        },
      } as unknown as Parameters<typeof defineConfig>[0])
    )

    // Adapter validation runs first (step 2) before data-source processing (step 3)
    expect(thrown).toBeInstanceOf(DuplicateAdapterError)
    expect(thrown).not.toBeInstanceOf(DataSourceConfigError)
  })

  it("first invalid data source in definition order causes error (not second)", () => {
    const trino = makeAdapterDefinition("trino")

    const thrown = catchError(() =>
      defineConfig({
        adapters: [trino],
        dataSources: {
          firstSource: {
            adapter: "unknown-adapter",
            connection: {},
          },
          secondSource: {
            adapter: "also-unknown",
            connection: {},
          },
        },
      } as unknown as Parameters<typeof defineConfig>[0])
    )

    expect(thrown).toBeInstanceOf(DataSourceConfigError)
    expect((thrown as DataSourceConfigError).sourceName).toBe("firstSource")
  })
})
