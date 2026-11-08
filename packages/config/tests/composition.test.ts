// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable vitest/max-expects
// oxlint-disable vitest/require-mock-type-parameters

import type {
  AdapterFactory,
  DataSource,
  DataSourceReadStrategy,
  DataSourceWriteStrategy,
  ResolveAuth,
} from "@lakeql/datasource"
import fc from "fast-check"
import { describe, expect, it, vi } from "vitest"

import { createLakeQLRuntime } from "../src/create-runtime"
import {
  DuplicateAdapterError,
  RuntimeConstructionError,
  UnknownAdapterError,
} from "../src/index"
import type {
  LoadedLakeQLConfig,
  RuntimeDataSourceDefinition,
} from "../src/types"

/**
 * Creates a mock {@link AdapterFactory} that records all method calls
 * and optionally fails on a specified method.
 */
function createMockFactory(
  adapterName: string,
  opts?: {
    failOn?: "createDataSource" | "createReadStrategy" | "createWriteStrategy"
  }
): AdapterFactory & {
  calls: {
    createDataSource: unknown[][]
    createReadStrategy: unknown[][]
    createWriteStrategy: unknown[][]
  }
  dataSources: { adapter: string; close: ReturnType<typeof vi.fn> }[]
} {
  const calls: {
    createDataSource: unknown[][]
    createReadStrategy: unknown[][]
    createWriteStrategy: unknown[][]
  } = {
    createDataSource: [],
    createReadStrategy: [],
    createWriteStrategy: [],
  }
  const dataSources: {
    adapter: string
    close: ReturnType<typeof vi.fn>
  }[] = []

  return {
    adapterName,
    createDataSource(config, name) {
      calls.createDataSource.push([config, name])
      if (opts?.failOn === "createDataSource") {
        throw new Error("ds-fail")
      }
      const ds = {
        adapter: adapterName,
        close: vi.fn<() => Promise<void>>().mockResolvedValue(),
      } as unknown as DataSource
      dataSources.push(ds as unknown as (typeof dataSources)[number])
      return ds
    },
    createReadStrategy(args) {
      calls.createReadStrategy.push([args])
      if (opts?.failOn === "createReadStrategy") {
        throw new Error("rs-fail")
      }
      return { read: vi.fn<() => void>() } as unknown as DataSourceReadStrategy
    },
    createWriteStrategy(args) {
      calls.createWriteStrategy.push([args])
      if (opts?.failOn === "createWriteStrategy") {
        throw new Error("ws-fail")
      }
      return {
        write: vi.fn<() => void>(),
      } as unknown as DataSourceWriteStrategy
    },
    calls,
    dataSources,
  }
}

/**
 * Builds a {@link LoadedLakeQLConfig} from a mapping of source name to
 * adapter name with optional connection and writeConfig values.
 */
function buildConfig(
  entries: {
    name: string
    adapter: string
    connection?: unknown
    writeConfig?: unknown
  }[]
): LoadedLakeQLConfig {
  // Prototype-less object so source names like "__proto__" become own
  // properties rather than mutating the prototype chain.
  const dataSources: Record<string, RuntimeDataSourceDefinition> =
    Object.create(null)
  for (const entry of entries) {
    dataSources[entry.name] = {
      adapter: entry.adapter,
      connection: entry.connection ?? { host: "localhost" },
      writeConfig: entry.writeConfig,
      paging: { defaultPerPage: 100, maxRecordsPerPage: 2000 },
    }
  }
  return { dataSources, sourcePath: "." }
}

describe("createLakeQLRuntime composition properties", () => {
  const resolveAuth = vi.fn().mockResolvedValue({}) as unknown as ResolveAuth

  describe("Factory invocation correctness", () => {
    /**
     * For any set of RuntimeDataSourceDefinition entries and matching
     * adapter factories, createLakeQLRuntime() calls each factory's
     * createDataSource() exactly once with the definition's connection
     * value and configured source name, calls createReadStrategy() with
     * that same data-source instance and the provided resolveAuth, and —
     * when writeConfig is not undefined — calls createWriteStrategy()
     * with that same data-source instance, the source name, and the
     * writeConfig value. It resolves only after all required components
     * are created.
     */
    it("invokes factory methods with correct arguments for each configured source", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc.record({
              // Prefix with "s-" to avoid numeric-only keys which V8
              // reorders as integer-indexed properties in Object.entries()
              name: fc
                .string({ minLength: 1, maxLength: 20 })
                .map((s) => `s-${s}`),
              hasWriteConfig: fc.boolean(),
            }),
            { minLength: 1, maxLength: 5, selector: (r) => r.name }
          ),
          async (entries) => {
            const adapterName = "test-adapter"
            const factory = createMockFactory(adapterName)

            const configEntries = entries.map((e) => ({
              name: e.name,
              adapter: adapterName,
              connection: { source: e.name },
              writeConfig: e.hasWriteConfig ? { write: e.name } : undefined,
            }))

            const config = buildConfig(configEntries)
            const runtime = await createLakeQLRuntime({
              config,
              adapters: [factory],
              resolveAuth,
            })

            // Each source had createDataSource called exactly once
            expect(factory.calls.createDataSource).toHaveLength(entries.length)

            // Each source had createReadStrategy called exactly once
            expect(factory.calls.createReadStrategy).toHaveLength(
              entries.length
            )

            // writeStrategy called only for sources with writeConfig
            const withWrite = entries.filter((e) => e.hasWriteConfig)
            expect(factory.calls.createWriteStrategy).toHaveLength(
              withWrite.length
            )

            // Verify createDataSource received correct connection and name
            for (const [i, entry] of configEntries.entries()) {
              const dsCall = factory.calls.createDataSource[i] as [
                unknown,
                string,
              ]
              expect(dsCall[0]).toStrictEqual(entry.connection)
              expect(dsCall[1]).toBe(entry.name)
            }

            // Verify createReadStrategy received the data source, resolveAuth,
            // and the resolved paging limits for the source.
            for (const [i] of configEntries.entries()) {
              const rsArgs = factory.calls.createReadStrategy[i] as [
                {
                  dataSource: DataSource
                  resolveAuth: unknown
                  paging: unknown
                },
              ]
              expect(rsArgs[0].dataSource).toBe(factory.dataSources[i])
              expect(rsArgs[0].resolveAuth).toBe(resolveAuth)
              expect(rsArgs[0].paging).toStrictEqual({
                defaultPerPage: 100,
                maxRecordsPerPage: 2000,
              })
            }

            // Verify writeStrategy arguments match sources that have writeConfig
            let wsIndex = 0
            for (const [i, entry] of configEntries.entries()) {
              if (entry.writeConfig !== undefined) {
                const wsArgs = factory.calls.createWriteStrategy[wsIndex] as [
                  {
                    dataSource: DataSource
                    dataSourceName: string
                    writeConfig: unknown
                  },
                ]
                expect(wsArgs[0].dataSource).toBe(factory.dataSources[i])
                expect(wsArgs[0].dataSourceName).toBe(entry.name)
                expect(wsArgs[0].writeConfig).toBe(entry.writeConfig)
                wsIndex += 1
              }
            }

            // Runtime resolved successfully
            expect(runtime).toBeDefined()
            await runtime.close()
          }
        )
      )
    })

    it("produces a valid empty runtime when dataSources map is empty", async () => {
      const config: LoadedLakeQLConfig = { dataSources: {}, sourcePath: "." }
      const factory = createMockFactory("unused")

      const runtime = await createLakeQLRuntime({
        config,
        adapters: [factory],
        resolveAuth,
      })

      expect(factory.calls.createDataSource).toHaveLength(0)
      expect(factory.calls.createReadStrategy).toHaveLength(0)
      expect(factory.calls.createWriteStrategy).toHaveLength(0)

      await runtime.close()
    })
  })

  describe("Duplicate adapter detection before construction", () => {
    /**
     * For any adapter factory list containing two or more factories with
     * the same adapterName, createLakeQLRuntime() throws a
     * DuplicateAdapterError without invoking createDataSource(),
     * createReadStrategy(), or createWriteStrategy() on any factory.
     */
    it("throws DuplicateAdapterError before any factory method is called", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (adapterName, sourceName) => {
            const factory1 = createMockFactory(adapterName)
            const factory2 = createMockFactory(adapterName)

            const config = buildConfig([
              { name: sourceName, adapter: adapterName },
            ])

            await expect(
              createLakeQLRuntime({
                config,
                adapters: [factory1, factory2],
                resolveAuth,
              })
            ).rejects.toThrow(DuplicateAdapterError)

            // No factory methods were called
            expect(factory1.calls.createDataSource).toHaveLength(0)
            expect(factory1.calls.createReadStrategy).toHaveLength(0)
            expect(factory1.calls.createWriteStrategy).toHaveLength(0)
            expect(factory2.calls.createDataSource).toHaveLength(0)
            expect(factory2.calls.createReadStrategy).toHaveLength(0)
            expect(factory2.calls.createWriteStrategy).toHaveLength(0)
          }
        )
      )
    })

    it("thrown error has the correct adapterName field", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          async (adapterName) => {
            const factory1 = createMockFactory(adapterName)
            const factory2 = createMockFactory(adapterName)

            const config: LoadedLakeQLConfig = {
              dataSources: {},
              sourcePath: ".",
            }

            try {
              await createLakeQLRuntime({
                config,
                adapters: [factory1, factory2],
                resolveAuth,
              })
              expect.fail("Expected DuplicateAdapterError")
            } catch (error) {
              expect(error).toBeInstanceOf(DuplicateAdapterError)
              const err = error as DuplicateAdapterError
              expect(err.adapterName).toBe(adapterName)
            }
          }
        )
      )
    })
  })

  describe("Unknown adapter detection with structured error", () => {
    /**
     * For any loaded config referencing an adapter name not present in
     * the provided factory list, createLakeQLRuntime() throws an
     * UnknownAdapterError whose adapterName field equals the unresolved
     * name and whose registeredAdapterNames field contains all names
     * from the factory list.
     */
    it("throws UnknownAdapterError with correct fields for missing adapter", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 1,
            maxLength: 5,
          }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (registeredNames, unknownAdapter, sourceName) => {
            fc.pre(!registeredNames.includes(unknownAdapter))

            const factories = registeredNames.map((name) =>
              createMockFactory(name)
            )

            const config = buildConfig([
              { name: sourceName, adapter: unknownAdapter },
            ])

            try {
              await createLakeQLRuntime({
                config,
                adapters: factories,
                resolveAuth,
              })
              expect.fail("Expected UnknownAdapterError")
            } catch (error) {
              expect(error).toBeInstanceOf(UnknownAdapterError)
              const err = error as UnknownAdapterError
              expect(err.adapterName).toBe(unknownAdapter)
              expect([...err.registeredAdapterNames]).toStrictEqual(
                registeredNames
              )
            }
          }
        )
      )
    })

    it("does not invoke factory methods for the failing or subsequent definitions", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (knownAdapter, unknownAdapter, sourceName) => {
            fc.pre(knownAdapter !== unknownAdapter)

            const factory = createMockFactory(knownAdapter)

            // Config has one known source then one unknown adapter source
            const config = buildConfig([
              { name: `${sourceName}-known`, adapter: knownAdapter },
              { name: `${sourceName}-unknown`, adapter: unknownAdapter },
              { name: `${sourceName}-after`, adapter: knownAdapter },
            ])

            try {
              await createLakeQLRuntime({
                config,
                adapters: [factory],
                resolveAuth,
              })
              expect.fail("Expected UnknownAdapterError")
            } catch (error) {
              expect(error).toBeInstanceOf(UnknownAdapterError)
            }

            // Only the first source (before the unknown) should have been processed
            expect(factory.calls.createDataSource).toHaveLength(1)
            expect(factory.calls.createReadStrategy).toHaveLength(1)
          }
        )
      )
    })
  })

  describe("Composition failure cleanup", () => {
    /**
     * When source B fails after source A was created:
     * - Source A's data source close() is called exactly once
     * - No runtime is returned
     * - The primary error is RuntimeConstructionError or UnknownAdapterError
     * - Cleanup errors attached if close() fails
     */
    it("closes previously created data sources when a subsequent factory call fails", async () => {
      const goodFactory = createMockFactory("good-adapter")
      const failFactory = createMockFactory("bad-adapter", {
        failOn: "createDataSource",
      })

      const config = buildConfig([
        { name: "source-a", adapter: "good-adapter" },
        { name: "source-b", adapter: "bad-adapter" },
      ])

      try {
        await createLakeQLRuntime({
          config,
          adapters: [goodFactory, failFactory],
          resolveAuth,
        })
        expect.fail("Expected RuntimeConstructionError")
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeConstructionError)
      }

      // Source A's data source close() was called exactly once
      expect(goodFactory.dataSources).toHaveLength(1)
      // oxlint-disable-next-line typescript/no-non-null-assertion -- index guaranteed in bounds
      const dsA = goodFactory.dataSources[0]!
      expect(dsA.close).toHaveBeenCalledOnce()
    })

    it("closes previously created data sources when unknown adapter is encountered", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (knownAdapter, unknownAdapter) => {
            fc.pre(knownAdapter !== unknownAdapter)

            const factory = createMockFactory(knownAdapter)

            const config = buildConfig([
              { name: "source-a", adapter: knownAdapter },
              { name: "source-b", adapter: unknownAdapter },
            ])

            try {
              await createLakeQLRuntime({
                config,
                adapters: [factory],
                resolveAuth,
              })
              expect.fail("Expected UnknownAdapterError")
            } catch (error) {
              expect(error).toBeInstanceOf(UnknownAdapterError)
            }

            // Source A was created and then closed during cleanup
            expect(factory.dataSources).toHaveLength(1)
            // oxlint-disable-next-line typescript/no-non-null-assertion -- index guaranteed in bounds
            const dsA = factory.dataSources[0]!
            expect(dsA.close).toHaveBeenCalledOnce()
          }
        )
      )
    })

    it("closes all prior data sources when readStrategy fails mid-sequence", async () => {
      const goodFactory = createMockFactory("good-adapter")
      const failFactory = createMockFactory("fail-adapter", {
        failOn: "createReadStrategy",
      })

      const config = buildConfig([
        { name: "source-a", adapter: "good-adapter" },
        { name: "source-b", adapter: "good-adapter" },
        { name: "source-c", adapter: "fail-adapter" },
      ])

      try {
        await createLakeQLRuntime({
          config,
          adapters: [goodFactory, failFactory],
          resolveAuth,
        })
        expect.fail("Expected RuntimeConstructionError")
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeConstructionError)
      }

      // Sources A and B were created, plus source C's data source was
      // created before readStrategy failed
      expect(goodFactory.dataSources).toHaveLength(2)
      expect(failFactory.dataSources).toHaveLength(1)

      // All created data sources should have been closed
      for (const ds of goodFactory.dataSources) {
        expect(ds.close).toHaveBeenCalledOnce()
      }
      for (const ds of failFactory.dataSources) {
        expect(ds.close).toHaveBeenCalledOnce()
      }
    })

    it("does not replace the primary error when cleanup close() fails", async () => {
      const goodFactory = createMockFactory("good-adapter")
      // Override close to reject
      // oxlint-disable-next-line eslint/func-name-matching -- intentional override
      goodFactory.createDataSource = function createDataSourceFailClose(
        config,
        name
      ) {
        goodFactory.calls.createDataSource.push([config, name])
        const ds = {
          adapter: "good-adapter",
          close: vi
            .fn<() => Promise<void>>()
            .mockRejectedValue(new Error("cleanup-fail")),
        } as unknown as DataSource
        goodFactory.dataSources.push(
          ds as unknown as (typeof goodFactory.dataSources)[number]
        )
        return ds
      }

      const failFactory = createMockFactory("bad-adapter", {
        failOn: "createDataSource",
      })

      const config = buildConfig([
        { name: "source-a", adapter: "good-adapter" },
        { name: "source-b", adapter: "bad-adapter" },
      ])

      try {
        await createLakeQLRuntime({
          config,
          adapters: [goodFactory, failFactory],
          resolveAuth,
        })
        expect.fail("Expected RuntimeConstructionError")
      } catch (error) {
        // Primary error is RuntimeConstructionError, not the cleanup failure
        expect(error).toBeInstanceOf(RuntimeConstructionError)
        const err = error as RuntimeConstructionError
        expect(err.sourceName).toBe("source-b")
        expect(err.adapterName).toBe("bad-adapter")

        // Cleanup errors may be attached as secondary info
        const withCleanup = err as RuntimeConstructionError & {
          cleanupErrors?: unknown[]
        }
        if (withCleanup.cleanupErrors) {
          expect(withCleanup.cleanupErrors.length).toBeGreaterThan(0)
        }
      }
    })

    it("closes all prior data sources when writeStrategy fails", async () => {
      const goodFactory = createMockFactory("good-adapter")
      const failFactory = createMockFactory("fail-adapter", {
        failOn: "createWriteStrategy",
      })

      const config = buildConfig([
        { name: "source-a", adapter: "good-adapter" },
        {
          name: "source-b",
          adapter: "fail-adapter",
          writeConfig: { path: "/data" },
        },
      ])

      try {
        await createLakeQLRuntime({
          config,
          adapters: [goodFactory, failFactory],
          resolveAuth,
        })
        expect.fail("Expected RuntimeConstructionError")
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeConstructionError)
      }

      // Source A and source B's data source were both created
      expect(goodFactory.dataSources).toHaveLength(1)
      expect(failFactory.dataSources).toHaveLength(1)

      // All created data sources closed during cleanup
      for (const ds of goodFactory.dataSources) {
        expect(ds.close).toHaveBeenCalledOnce()
      }
      for (const ds of failFactory.dataSources) {
        expect(ds.close).toHaveBeenCalledOnce()
      }
    })

    it("no runtime is returned on any composition failure", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            "createDataSource",
            "createReadStrategy",
            "createWriteStrategy"
          ) as fc.Arbitrary<
            "createDataSource" | "createReadStrategy" | "createWriteStrategy"
          >,
          async (failOn) => {
            const factory = createMockFactory("adapter", { failOn })

            const config = buildConfig([
              {
                name: "source",
                adapter: "adapter",
                writeConfig:
                  failOn === "createWriteStrategy" ? { w: true } : undefined,
              },
            ])

            let result: unknown
            try {
              result = await createLakeQLRuntime({
                config,
                adapters: [factory],
                resolveAuth,
              })
            } catch {
              // Expected
            }

            expect(result).toBeUndefined()
          }
        )
      )
    })
  })
})
