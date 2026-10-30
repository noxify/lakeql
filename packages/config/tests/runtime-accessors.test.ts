// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable vitest/max-expects
// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable unicorn/no-useless-undefined

import type {
  AdapterFactory,
  DataSource,
  DataSourceReadStrategy,
  DataSourceWriteStrategy,
} from "@lakeql/datasource"
import fc from "fast-check"
import { describe, expect, it, vi } from "vitest"

import { createLakeQLRuntime } from "../src/create-runtime"
import {
  UnknownDataSourceError,
  WriteStrategyNotConfiguredError,
} from "../src/index"
import type {
  CreateLakeQLRuntimeOptions,
  LoadedLakeQLConfig,
} from "../src/types"

/**
 * Creates a mock {@link AdapterFactory} that records close calls for each
 * data source it creates. Each data source gets its own mock `close` function
 * stored in `closeFns` keyed by configured source name.
 */
function createMockFactory(name: string): {
  factory: AdapterFactory
  closeFns: Map<string, ReturnType<typeof vi.fn>>
} {
  const closeFns = new Map<string, ReturnType<typeof vi.fn>>()
  return {
    factory: {
      adapterName: name,
      createDataSource(_config: unknown, sourceName: string) {
        const closeFn = vi.fn().mockResolvedValue(undefined)
        closeFns.set(sourceName, closeFn)
        return {
          adapter: name,
          capabilities: {
            query: true,
            stream: true,
            metadata: true,
            ddl: true,
            write: true,
          },
          query: vi.fn(),
          stream: vi.fn(),
          catalogs: vi.fn(),
          schemas: vi.fn(),
          tables: vi.fn(),
          views: vi.fn(),
          columns: vi.fn(),
          createTable: vi.fn(),
          dropTable: vi.fn(),
          qualifiedTableName: vi.fn(),
          close: closeFn,
        } as unknown as DataSource
      },
      createReadStrategy() {
        return { read: vi.fn() } as unknown as DataSourceReadStrategy
      },
      createWriteStrategy() {
        return { write: vi.fn() } as unknown as DataSourceWriteStrategy
      },
    },
    closeFns,
  }
}

/**
 * Builds a {@link CreateLakeQLRuntimeOptions} from a list of source definitions.
 * Each entry specifies a source name, adapter name, and whether a writeConfig is present.
 *
 * Returns a `getCloseFn` accessor that retrieves close mocks populated during
 * runtime creation (since `createDataSource` populates them lazily).
 */
function buildOptions(
  sources: { sourceName: string; adapterName: string; hasWrite: boolean }[]
): {
  options: CreateLakeQLRuntimeOptions
  getCloseFn: (sourceName: string) => ReturnType<typeof vi.fn> | undefined
} {
  // Group sources by adapter name
  const adapterNames = [...new Set(sources.map((s) => s.adapterName))]
  const mocks = new Map(
    adapterNames.map((n) => [n, createMockFactory(n)] as const)
  )

  const dataSources: Record<
    string,
    {
      adapter: string
      connection: unknown
      writeConfig?: unknown
      paging: { defaultPerPage: number; maxRecordsPerPage: number }
    }
  > = {}
  for (const { sourceName, adapterName, hasWrite } of sources) {
    dataSources[sourceName] = {
      adapter: adapterName,
      connection: { host: sourceName },
      paging: { defaultPerPage: 100, maxRecordsPerPage: 2000 },
      ...(hasWrite ? { writeConfig: { target: sourceName } } : {}),
    }
  }

  const config: LoadedLakeQLConfig = { dataSources, sourcePath: "." }
  // oxlint-disable-next-line typescript/no-non-null-assertion -- Map.get is guaranteed for known adapter names
  const adapters = adapterNames.map((n) => mocks.get(n)!.factory)

  // Lazily look up closeFns from the underlying mock factories (populated
  // during createLakeQLRuntime when createDataSource is called).
  const getCloseFn = (
    sourceName: string
  ): ReturnType<typeof vi.fn> | undefined => {
    for (const mock of mocks.values()) {
      const fn = mock.closeFns.get(sourceName)
      if (fn) {
        return fn
      }
    }
    return undefined
  }

  return {
    options: { config, adapters, resolveAuth: vi.fn() },
    getCloseFn,
  }
}

describe("Runtime accessor and close properties", () => {
  describe("Runtime accessor completeness and referential stability", () => {
    /**
     * For any successfully composed LakeQLRuntime and any configured source
     * name, `getDataSource(name)`, `getReadStrategy(name)`, and
     * `getWriteStrategy(name)` each return the instance created for that
     * source during composition, and repeated calls return the identical
     * (reference-equal) instance.
     */
    it("each accessor returns the expected instance and repeated calls return the same reference", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc
              .string({ minLength: 1, maxLength: 20 })
              .filter(
                (s) =>
                  s !== "__proto__" && s !== "constructor" && s !== "prototype"
              ),
            {
              minLength: 1,
              maxLength: 5,
            }
          ),
          async (sourceNames) => {
            const sources = sourceNames.map((name) => ({
              sourceName: name,
              adapterName: "test-adapter",
              hasWrite: true,
            }))
            const { options } = buildOptions(sources)
            const runtime = await createLakeQLRuntime(options)

            try {
              for (const name of sourceNames) {
                // Each accessor returns a defined value
                const ds1 = runtime.getDataSource(name)
                const rs1 = runtime.getReadStrategy(name)
                const ws1 = runtime.getWriteStrategy(name)

                expect(ds1).toBeDefined()
                expect(rs1).toBeDefined()
                expect(ws1).toBeDefined()

                // Repeated calls return the same reference
                expect(runtime.getDataSource(name)).toBe(ds1)
                expect(runtime.getReadStrategy(name)).toBe(rs1)
                expect(runtime.getWriteStrategy(name)).toBe(ws1)
              }
            } finally {
              await runtime.close()
            }
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  describe("Unknown source name produces UnknownDataSourceError", () => {
    /**
     * For any LakeQLRuntime and any string that is not a configured source
     * name, all three accessors throw UnknownDataSourceError with correct
     * `sourceName` and `configuredSourceNames` fields.
     */
    it("all three accessors throw UnknownDataSourceError for absent names", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc
              .string({ minLength: 1, maxLength: 20 })
              .filter(
                (s) =>
                  s !== "__proto__" && s !== "constructor" && s !== "prototype"
              ),
            {
              minLength: 1,
              maxLength: 5,
            }
          ),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (sourceNames, absentCandidate) => {
            fc.pre(!sourceNames.includes(absentCandidate))

            const sources = sourceNames.map((name) => ({
              sourceName: name,
              adapterName: "test-adapter",
              hasWrite: true,
            }))
            const { options } = buildOptions(sources)
            const runtime = await createLakeQLRuntime(options)

            // The runtime iterates Object.entries(config.dataSources), so the
            // configuredSourceNames snapshot follows JS property enumeration order
            // (integer-indexed keys first in ascending order, then string keys in
            // insertion order).
            const expectedOrder = Object.keys(options.config.dataSources)

            try {
              // getDataSource
              expect(() => runtime.getDataSource(absentCandidate)).toThrow(
                UnknownDataSourceError
              )
              try {
                runtime.getDataSource(absentCandidate)
              } catch (error) {
                const err = error as UnknownDataSourceError
                expect(err).toBeInstanceOf(UnknownDataSourceError)
                expect(err.sourceName).toBe(absentCandidate)
                expect([...err.configuredSourceNames]).toStrictEqual(
                  expectedOrder
                )
              }

              // getReadStrategy
              expect(() => runtime.getReadStrategy(absentCandidate)).toThrow(
                UnknownDataSourceError
              )
              try {
                runtime.getReadStrategy(absentCandidate)
              } catch (error) {
                const err = error as UnknownDataSourceError
                expect(err).toBeInstanceOf(UnknownDataSourceError)
                expect(err.sourceName).toBe(absentCandidate)
                expect([...err.configuredSourceNames]).toStrictEqual(
                  expectedOrder
                )
              }

              // getWriteStrategy
              expect(() => runtime.getWriteStrategy(absentCandidate)).toThrow(
                UnknownDataSourceError
              )
              try {
                runtime.getWriteStrategy(absentCandidate)
              } catch (error) {
                const err = error as UnknownDataSourceError
                expect(err).toBeInstanceOf(UnknownDataSourceError)
                expect(err.sourceName).toBe(absentCandidate)
                expect([...err.configuredSourceNames]).toStrictEqual(
                  expectedOrder
                )
              }
            } finally {
              await runtime.close()
            }
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  describe("Write strategy unavailable for sources without writeConfig", () => {
    /**
     * For any configured source whose definition does not include writeConfig,
     * `getWriteStrategy()` throws WriteStrategyNotConfiguredError (not
     * UnknownDataSourceError) with the correct `sourceName`.
     */
    it("getWriteStrategy throws WriteStrategyNotConfiguredError for sources without writeConfig", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc
              .string({ minLength: 1, maxLength: 20 })
              .filter(
                (s) =>
                  s !== "__proto__" && s !== "constructor" && s !== "prototype"
              ),
            {
              minLength: 1,
              maxLength: 5,
            }
          ),
          async (sourceNames) => {
            // All sources configured without writeConfig
            const sources = sourceNames.map((name) => ({
              sourceName: name,
              adapterName: "test-adapter",
              hasWrite: false,
            }))
            const { options } = buildOptions(sources)
            const runtime = await createLakeQLRuntime(options)

            try {
              for (const name of sourceNames) {
                // getDataSource and getReadStrategy still work
                expect(runtime.getDataSource(name)).toBeDefined()
                expect(runtime.getReadStrategy(name)).toBeDefined()

                // getWriteStrategy throws the correct error
                expect(() => runtime.getWriteStrategy(name)).toThrow(
                  WriteStrategyNotConfiguredError
                )

                try {
                  runtime.getWriteStrategy(name)
                } catch (error) {
                  const err = error as WriteStrategyNotConfiguredError
                  expect(err).toBeInstanceOf(WriteStrategyNotConfiguredError)
                  expect(err).not.toBeInstanceOf(UnknownDataSourceError)
                  expect(err.sourceName).toBe(name)
                  expect(err.name).toBe("WriteStrategyNotConfiguredError")
                }
              }
            } finally {
              await runtime.close()
            }
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  describe("Close idempotence and completeness", () => {
    /**
     * For any LakeQLRuntime owning N data sources, calling close() K times
     * results in each data source's close() being called exactly once total
     * regardless of K, and all calls after the first return the same promise
     * without invoking data-source close() again.
     */
    it("close() invokes each data source close exactly once and returns the same promise on subsequent calls", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc
              .string({ minLength: 1, maxLength: 20 })
              .filter(
                (s) =>
                  s !== "__proto__" && s !== "constructor" && s !== "prototype"
              ),
            {
              minLength: 1,
              maxLength: 5,
            }
          ),
          fc.integer({ min: 1, max: 5 }),
          async (sourceNames, closeCallCount) => {
            const sources = sourceNames.map((name) => ({
              sourceName: name,
              adapterName: "test-adapter",
              hasWrite: false,
            }))
            const { options, getCloseFn } = buildOptions(sources)
            const runtime = await createLakeQLRuntime(options)

            // Call close() K times and collect the promise references
            const promises: Promise<void>[] = []
            for (let i = 0; i < closeCallCount; i += 1) {
              promises.push(runtime.close())
            }

            // All promises are the same reference
            for (const p of promises) {
              expect(p).toBe(promises[0])
            }

            await promises[0]

            // Each data source close() called exactly once
            for (const name of sourceNames) {
              const closeFn = getCloseFn(name)
              expect(closeFn).toBeDefined()
              expect(closeFn).toHaveBeenCalledOnce()
            }
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  describe("Close resilience under partial failure", () => {
    /**
     * When a subset of data-source close() calls reject, runtime close()
     * still invokes close() on all remaining data sources and rejects
     * with an error preserving at least the first failure as cause.
     */
    it("close() invokes all data source close() calls even when some reject, and rejects with first cause", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc
              .string({ minLength: 1, maxLength: 20 })
              .filter(
                (s) =>
                  s !== "__proto__" && s !== "constructor" && s !== "prototype"
              ),
            {
              minLength: 2,
              maxLength: 5,
            }
          ),
          fc.nat(),
          async (sourceNames, failIndexSeed) => {
            // Choose which source's close() will fail
            const failIndex = failIndexSeed % sourceNames.length
            // oxlint-disable-next-line typescript/no-non-null-assertion -- index guaranteed in bounds
            const failingSourceName = sourceNames[failIndex]!

            const sources = sourceNames.map((name) => ({
              sourceName: name,
              adapterName: "test-adapter",
              hasWrite: false,
            }))
            const { options, getCloseFn } = buildOptions(sources)
            const runtime = await createLakeQLRuntime(options)

            // Make the selected data source's close() reject
            const failureError = new Error(`close failed: ${failingSourceName}`)
            // oxlint-disable-next-line typescript/no-non-null-assertion -- guaranteed by test setup
            const failingCloseFn = getCloseFn(failingSourceName)!
            failingCloseFn.mockRejectedValue(failureError)

            // close() should reject
            await expect(runtime.close()).rejects.toThrow(
              "One or more data sources failed to close"
            )

            // All data source close() calls were still made
            for (const name of sourceNames) {
              const closeFn = getCloseFn(name)
              expect(closeFn).toBeDefined()
              expect(closeFn).toHaveBeenCalledOnce()
            }

            // Verify the rejection preserves the first failure as cause
            try {
              await runtime.close()
            } catch (error) {
              expect(error).toBeInstanceOf(Error)
              const err = error as Error
              expect(err.cause).toBe(failureError)
            }
          }
        ),
        { numRuns: 20 }
      )
    })
  })
})
