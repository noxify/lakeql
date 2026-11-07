// oxlint-disable vitest/no-conditional-expect
// oxlint-disable import/no-named-as-default-member
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
import { UnknownAdapterError } from "../src/errors/unknown-adapter-error"
import { RuntimeLifecycleManager } from "../src/lifecycle-manager"
import type { LoadedLakeQLConfig } from "../src/types"

/**
 * Creates a mock {@link AdapterFactory} that produces trackable data sources.
 * Each data source's `close()` is a Vitest spy for verifying lifecycle calls.
 */
function createTrackingFactory(adapterName: string): AdapterFactory & {
  dataSources: { name: string; close: ReturnType<typeof vi.fn> }[]
} {
  const dataSources: { name: string; close: ReturnType<typeof vi.fn> }[] = []

  return {
    adapterName,
    createDataSource(_config: unknown, name: string): DataSource {
      const ds = {
        adapter: adapterName,
        name,
        close: vi.fn<() => Promise<void>>().mockResolvedValue(),
      } as unknown as DataSource
      dataSources.push(
        ds as unknown as (typeof dataSources)[number] & { name: string }
      )
      return ds
    },
    createReadStrategy(): DataSourceReadStrategy {
      return { read: vi.fn() } as unknown as DataSourceReadStrategy
    },
    createWriteStrategy(): DataSourceWriteStrategy {
      return { write: vi.fn() } as unknown as DataSourceWriteStrategy
    },
    dataSources,
  }
}

/**
 * Builds a {@link LoadedLakeQLConfig} from source name(s) and adapter name.
 */
function buildConfig(
  sourceNames: string[],
  adapterName: string,
  opts?: { writeConfig?: unknown }
): LoadedLakeQLConfig {
  const dataSources: Record<
    string,
    {
      adapter: string
      connection: unknown
      writeConfig?: unknown
      paging: { defaultPerPage: number; maxRecordsPerPage: number }
    }
  > = {}
  for (const name of sourceNames) {
    dataSources[name] = {
      adapter: adapterName,
      connection: { host: "localhost" },
      writeConfig: opts?.writeConfig,
      paging: { defaultPerPage: 100, maxRecordsPerPage: 2000 },
    }
  }
  return { dataSources, sourcePath: "." }
}

describe("RuntimeLifecycleManager properties", () => {
  const resolveAuth = vi.fn().mockResolvedValue({}) as unknown as ResolveAuth

  describe("Safe reload preserves old runtime on construction failure", () => {
    /**
     * For any reload attempt where createLakeQLRuntime() rejects, the
     * lifecycle manager keeps the old runtime as the active instance with
     * all its accessors returning their existing instances, does NOT call
     * close() on the old runtime, and propagates the construction error
     * to the caller.
     */
    it("keeps old runtime active when reload construction fails", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc.string({ minLength: 1, maxLength: 15 }).map((s) => `s-${s}`),
            { minLength: 1, maxLength: 4 }
          ),
          fc.string({ minLength: 1, maxLength: 15 }).map((s) => `bad-${s}`),
          async (sourceNames, unknownAdapter) => {
            const adapterName = "good-adapter"
            fc.pre(adapterName !== unknownAdapter)

            const factory = createTrackingFactory(adapterName)

            // Create the initial runtime
            const initialConfig = buildConfig(sourceNames, adapterName)
            const initialRuntime = await createLakeQLRuntime({
              config: initialConfig,
              adapters: [factory],
              resolveAuth,
            })

            const manager = new RuntimeLifecycleManager(initialRuntime)

            // Capture references to old runtime's instances
            const oldDataSources = sourceNames.map((name) =>
              initialRuntime.getDataSource(name)
            )
            const oldReadStrategies = sourceNames.map((name) =>
              initialRuntime.getReadStrategy(name)
            )

            // Track which data sources belonged to the initial runtime
            const initialDsCount = factory.dataSources.length

            // Attempt reload with unknown adapter — causes construction failure
            const badConfig = buildConfig(sourceNames, unknownAdapter)
            await expect(
              manager.reload({
                config: badConfig,
                adapters: [factory],
                resolveAuth,
              })
            ).rejects.toThrow(UnknownAdapterError)

            // Old runtime still active
            expect(manager.runtime).toBe(initialRuntime)

            // Old runtime accessors still return the same instances
            for (const [i, name] of sourceNames.entries()) {
              expect(manager.runtime.getDataSource(name)).toBe(
                oldDataSources[i]
              )
              expect(manager.runtime.getReadStrategy(name)).toBe(
                oldReadStrategies[i]
              )
            }

            // Old runtime's close() was NOT called (verify via data source spies)
            for (let i = 0; i < initialDsCount; i += 1) {
              // oxlint-disable-next-line typescript/no-non-null-assertion -- index guaranteed in bounds
              expect(factory.dataSources[i]!.close).not.toHaveBeenCalled()
            }

            // Clean up
            await initialRuntime.close()
          }
        ),
        { numRuns: 20 }
      )
    })

    it("propagates the construction error to the reload caller", async () => {
      const adapterName = "test-adapter"
      const factory = createTrackingFactory(adapterName)

      const initialConfig = buildConfig(["source-1"], adapterName)
      const initialRuntime = await createLakeQLRuntime({
        config: initialConfig,
        adapters: [factory],
        resolveAuth,
      })

      const manager = new RuntimeLifecycleManager(initialRuntime)

      // Reload with config that references a non-existent adapter
      const badConfig = buildConfig(["source-1"], "nonexistent-adapter")

      try {
        await manager.reload({
          config: badConfig,
          adapters: [factory],
          resolveAuth,
        })
        expect.fail("Expected reload to throw")
      } catch (error) {
        expect(error).toBeInstanceOf(UnknownAdapterError)
        const err = error as UnknownAdapterError
        expect(err.adapterName).toBe("nonexistent-adapter")
      }

      await initialRuntime.close()
    })
  })

  describe("Safe reload replaces runtime only after successful construction", () => {
    /**
     * For any reload attempt where createLakeQLRuntime() resolves
     * successfully, the lifecycle manager calls close() on the old
     * runtime only after the new runtime is ready, and exposes the new
     * runtime as active even if the old runtime's close() rejects.
     */
    it("replaces runtime and closes old one on successful reload", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc.string({ minLength: 1, maxLength: 15 }).map((s) => `s-${s}`),
            { minLength: 1, maxLength: 4 }
          ),
          async (sourceNames) => {
            const adapterName = "reload-adapter"
            const factory = createTrackingFactory(adapterName)

            // Create the initial runtime
            const initialConfig = buildConfig(sourceNames, adapterName)
            const initialRuntime = await createLakeQLRuntime({
              config: initialConfig,
              adapters: [factory],
              resolveAuth,
            })

            const manager = new RuntimeLifecycleManager(initialRuntime)
            const initialDsCount = factory.dataSources.length

            // Reload with a valid new config
            const newConfig = buildConfig(sourceNames, adapterName)
            const newRuntime = await manager.reload({
              config: newConfig,
              adapters: [factory],
              resolveAuth,
            })

            // New runtime is active and different from old
            expect(manager.runtime).toBe(newRuntime)
            expect(manager.runtime).not.toBe(initialRuntime)

            // Old runtime's data sources were closed exactly once
            for (let i = 0; i < initialDsCount; i += 1) {
              // oxlint-disable-next-line typescript/no-non-null-assertion -- index guaranteed in bounds
              expect(factory.dataSources[i]!.close).toHaveBeenCalledOnce()
            }

            // New runtime's data sources were NOT closed
            for (
              let i = initialDsCount;
              i < factory.dataSources.length;
              i += 1
            ) {
              // oxlint-disable-next-line typescript/no-non-null-assertion -- index guaranteed in bounds
              expect(factory.dataSources[i]!.close).not.toHaveBeenCalled()
            }

            // New runtime accessors work
            for (const name of sourceNames) {
              expect(() => manager.runtime.getDataSource(name)).not.toThrow()
              expect(() => manager.runtime.getReadStrategy(name)).not.toThrow()
            }

            // Clean up
            await newRuntime.close()
          }
        ),
        { numRuns: 20 }
      )
    })

    it("exposes new runtime as active even when old runtime close() rejects", async () => {
      const adapterName = "close-fail-adapter"

      // Create a factory where close() rejects
      const failCloseFactory: AdapterFactory & {
        dataSources: { name: string; close: ReturnType<typeof vi.fn> }[]
      } = {
        adapterName,
        createDataSource(_config: unknown, name: string): DataSource {
          const ds = {
            adapter: adapterName,
            name,
            close: vi
              .fn<() => Promise<void>>()
              .mockRejectedValue(new Error("close-failed")),
          } as unknown as DataSource
          failCloseFactory.dataSources.push(
            ds as unknown as (typeof failCloseFactory.dataSources)[number]
          )
          return ds
        },
        createReadStrategy(): DataSourceReadStrategy {
          return { read: vi.fn() } as unknown as DataSourceReadStrategy
        },
        createWriteStrategy(): DataSourceWriteStrategy {
          return { write: vi.fn() } as unknown as DataSourceWriteStrategy
        },
        dataSources: [],
      }

      // A second factory for the new runtime (with normal close behavior)
      const goodFactory = createTrackingFactory("good-adapter")

      // Create initial runtime with the failing-close factory
      const initialConfig = buildConfig(["src-1"], adapterName)
      const initialRuntime = await createLakeQLRuntime({
        config: initialConfig,
        adapters: [failCloseFactory],
        resolveAuth,
      })

      const manager = new RuntimeLifecycleManager(initialRuntime)

      // Reload with the good factory — construction succeeds but old close() rejects
      const newConfig = buildConfig(["src-1"], "good-adapter")

      await expect(
        manager.reload({
          config: newConfig,
          adapters: [goodFactory],
          resolveAuth,
        })
      ).rejects.toThrow("One or more data sources failed to close")

      // Despite the close error, the new runtime is still active
      expect(manager.runtime).not.toBe(initialRuntime)
      expect(() => manager.runtime.getDataSource("src-1")).not.toThrow()
      expect(() => manager.runtime.getReadStrategy("src-1")).not.toThrow()

      // Clean up
      await manager.runtime.close()
    })

    it("calls close() on old runtime only after new runtime is ready", async () => {
      const adapterName = "order-adapter"
      const events: string[] = []

      // Factory that logs creation order
      const orderFactory: AdapterFactory = {
        adapterName,
        createDataSource(_config: unknown, name: string): DataSource {
          events.push(`create-ds:${name}`)
          return {
            adapter: adapterName,
            close: vi.fn(async () => {
              events.push(`close-ds:${name}`)
            }),
          } as unknown as DataSource
        },
        createReadStrategy(): DataSourceReadStrategy {
          events.push("create-rs")
          return { read: vi.fn() } as unknown as DataSourceReadStrategy
        },
        createWriteStrategy(): DataSourceWriteStrategy {
          return { write: vi.fn() } as unknown as DataSourceWriteStrategy
        },
      }

      // Create initial runtime
      const initialConfig = buildConfig(["origin"], adapterName)
      const initialRuntime = await createLakeQLRuntime({
        config: initialConfig,
        adapters: [orderFactory],
        resolveAuth,
      })

      const manager = new RuntimeLifecycleManager(initialRuntime)

      // Clear events from initial creation
      events.length = 0

      // Reload — new runtime creation events should appear before old close
      const newConfig = buildConfig(["replacement"], adapterName)
      await manager.reload({
        config: newConfig,
        adapters: [orderFactory],
        resolveAuth,
      })

      // Events should be: create-ds:replacement, create-rs, close-ds:origin
      const createIndex = events.indexOf("create-ds:replacement")
      const closeIndex = events.indexOf("close-ds:origin")

      expect(createIndex).toBeGreaterThanOrEqual(0)
      expect(closeIndex).toBeGreaterThanOrEqual(0)
      expect(createIndex).toBeLessThan(closeIndex)

      await manager.runtime.close()
    })
  })
})
