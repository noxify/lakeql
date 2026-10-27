// oxlint-disable vitest/no-conditional-expect
// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/require-mock-type-parameters

import type {
  AdapterFactory,
  DataSource,
  DataSourceReadStrategy,
  DataSourceWriteStrategy,
} from "@lakeql/datasource"
import fc from "fast-check"
import { describe, expect, it, vi } from "vitest"

import { createLakeQLRuntime } from "../src/create-runtime"
import type { LoadedLakeQLConfig } from "../src/types"

/**
 * Creates a factory that produces unique data-source, read-strategy, and
 * write-strategy instances per invocation. Each created data source tracks
 * whether `close()` was called via a Vitest spy.
 */
function makeTrackingFactory(adapterName: string): AdapterFactory {
  return {
    adapterName,
    createDataSource(_config: unknown, name: string): DataSource {
      return {
        adapter: adapterName,
        capabilities: { supportsStreaming: false },
        query: vi.fn(),
        stream: vi.fn(),
        catalogs: vi.fn(),
        schemas: vi.fn(),
        tables: vi.fn(),
        views: vi.fn(),
        columns: vi.fn(),
        createTable: vi.fn(),
        dropTable: vi.fn(),
        qualifiedTableName: vi.fn(() => name),
        close: vi.fn(async () => {}),
      } as unknown as DataSource
    },
    createReadStrategy(): DataSourceReadStrategy {
      return {
        read: vi.fn(async () => ({
          totalCount: 0,
          pageInfo: {
            maxPages: 0,
            hasNext: false,
            hasPrevious: false,
            currentPage: 1,
            nextPage: null,
            previousPage: null,
          },
          nodes: [],
        })),
      } as unknown as DataSourceReadStrategy
    },
    createWriteStrategy(): DataSourceWriteStrategy {
      return {
        write: vi.fn(async () => {}),
      } as unknown as DataSourceWriteStrategy
    },
  }
}

/**
 * Generates a non-empty unique name suitable for use as a data-source name.
 */
const sourceNameArb = fc.string({ minLength: 1, maxLength: 20 }).filter(
  // Exclude names that could cause issues as object keys
  (s) => s.trim().length > 0 && !s.includes("__proto__")
)

describe("Runtime isolation under concurrent operation", () => {
  /**
   * For any two independently created LakeQLRuntime instances (even from
   * the same AdapterFactory objects), they own distinct data-source and
   * strategy instances (not reference-equal), and closing one does NOT
   * invoke close() on data sources owned by the other, leaving the
   * other's accessors fully functional.
   */
  it("two runtimes from the same factories own distinct instances and independent lifecycles", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(sourceNameArb, { minLength: 1, maxLength: 5 }),
        fc.uniqueArray(sourceNameArb, { minLength: 1, maxLength: 5 }),
        async (namesA, namesB) => {
          // Use the SAME factory object for both runtimes
          const sharedFactory = makeTrackingFactory("shared")

          const configA: LoadedLakeQLConfig = {
            dataSources: Object.fromEntries(
              namesA.map((name) => [
                name,
                {
                  adapter: "shared",
                  connection: { id: `a-${name}` },
                  paging: { defaultPerPage: 100, maxRecordsPerPage: 2000 },
                },
              ])
            ),
            sourcePath: ".",
          }

          const configB: LoadedLakeQLConfig = {
            dataSources: Object.fromEntries(
              namesB.map((name) => [
                name,
                {
                  adapter: "shared",
                  connection: { id: `b-${name}` },
                  paging: { defaultPerPage: 100, maxRecordsPerPage: 2000 },
                },
              ])
            ),
            sourcePath: ".",
          }

          const resolveAuth = vi.fn()

          // Create two runtimes concurrently from the same factory objects
          const [rtA, rtB] = await Promise.all([
            createLakeQLRuntime({
              config: configA,
              adapters: [sharedFactory],
              resolveAuth,
            }),
            createLakeQLRuntime({
              config: configB,
              adapters: [sharedFactory],
              resolveAuth,
            }),
          ])

          // Verify distinct data-source instances for sources that share a name
          for (const name of namesA) {
            if (namesB.includes(name)) {
              expect(rtA.getDataSource(name)).not.toBe(rtB.getDataSource(name))
              expect(rtA.getReadStrategy(name)).not.toBe(
                rtB.getReadStrategy(name)
              )
            }
          }

          // Verify distinct instances even when accessed from different runtimes
          for (const name of namesA) {
            const dsA = rtA.getDataSource(name)
            for (const nameB of namesB) {
              const dsB = rtB.getDataSource(nameB)
              expect(dsA).not.toBe(dsB)
            }
          }

          // Close runtime A — should NOT affect runtime B
          await rtA.close()

          // Verify runtime B's data source close() was NOT called
          for (const name of namesB) {
            const dsB = rtB.getDataSource(name) as unknown as {
              close: ReturnType<typeof vi.fn>
            }
            expect(dsB.close).not.toHaveBeenCalled()
          }

          // Verify runtime B's accessors still work
          for (const name of namesB) {
            expect(() => rtB.getDataSource(name)).not.toThrow()
            expect(() => rtB.getReadStrategy(name)).not.toThrow()
          }

          // Clean up runtime B
          await rtB.close()
        }
      ),
      { numRuns: 20 }
    )
  })

  it("two runtimes with identical source names own distinct instances", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(sourceNameArb, { minLength: 1, maxLength: 4 }),
        async (names) => {
          // Same factory, same source names, same connection shape
          const sharedFactory = makeTrackingFactory("shared")

          const config: LoadedLakeQLConfig = {
            dataSources: Object.fromEntries(
              names.map((name) => [
                name,
                {
                  adapter: "shared",
                  connection: {},
                  paging: { defaultPerPage: 100, maxRecordsPerPage: 2000 },
                },
              ])
            ),
            sourcePath: ".",
          }

          const resolveAuth = vi.fn()

          const [rt1, rt2] = await Promise.all([
            createLakeQLRuntime({
              config,
              adapters: [sharedFactory],
              resolveAuth,
            }),
            createLakeQLRuntime({
              config,
              adapters: [sharedFactory],
              resolveAuth,
            }),
          ])

          // Each runtime owns distinct data-source and strategy instances
          for (const name of names) {
            expect(rt1.getDataSource(name)).not.toBe(rt2.getDataSource(name))
            expect(rt1.getReadStrategy(name)).not.toBe(
              rt2.getReadStrategy(name)
            )
          }

          // Close rt1 — verify rt2's data sources were NOT closed
          await rt1.close()

          for (const name of names) {
            const ds2 = rt2.getDataSource(name) as unknown as {
              close: ReturnType<typeof vi.fn>
            }
            expect(ds2.close).not.toHaveBeenCalled()
          }

          // rt2 accessors still functional
          for (const name of names) {
            expect(() => rt2.getDataSource(name)).not.toThrow()
            expect(() => rt2.getReadStrategy(name)).not.toThrow()
          }

          await rt2.close()
        }
      ),
      { numRuns: 20 }
    )
  })

  it("runtimes do not share AdapterRegistry instances", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(sourceNameArb, { minLength: 1, maxLength: 3 }),
        async (names) => {
          const factory = makeTrackingFactory("test-adapter")
          const createDataSourceSpy = vi.spyOn(factory, "createDataSource")

          const config: LoadedLakeQLConfig = {
            dataSources: Object.fromEntries(
              names.map((name) => [
                name,
                {
                  adapter: "test-adapter",
                  connection: {},
                  paging: { defaultPerPage: 100, maxRecordsPerPage: 2000 },
                },
              ])
            ),
            sourcePath: ".",
          }

          const resolveAuth = vi.fn()

          const rt1 = await createLakeQLRuntime({
            config,
            adapters: [factory],
            resolveAuth,
          })

          const callsAfterRt1 = createDataSourceSpy.mock.calls.length

          const rt2 = await createLakeQLRuntime({
            config,
            adapters: [factory],
            resolveAuth,
          })

          const callsAfterRt2 = createDataSourceSpy.mock.calls.length

          // Each runtime triggered its own set of factory calls
          expect(callsAfterRt2 - callsAfterRt1).toBe(names.length)

          // Each runtime has independently constructed data sources
          for (const name of names) {
            expect(rt1.getDataSource(name)).not.toBe(rt2.getDataSource(name))
          }

          await rt1.close()
          await rt2.close()
        }
      ),
      { numRuns: 20 }
    )
  })
})
