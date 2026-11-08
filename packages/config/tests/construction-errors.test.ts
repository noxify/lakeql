// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable vitest/max-expects

import type { AdapterFactory, DataSource } from "@lakeql/datasource"
import { FakeDataSource } from "@lakeql/datasource/testing"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { createLakeQLRuntime } from "../src/create-runtime"
import { RuntimeConstructionError } from "../src/index"

/**
 * Creates a minimal fake {@link DataSource} for testing purposes.
 */
function makeFakeDataSource(adapterName: string): DataSource {
  const ds = new FakeDataSource()
  // Override the adapter name for testing while preserving DataSource interface
  Object.defineProperty(ds, "adapter", { value: adapterName })
  return ds
}

describe("Construction error wrapping preserves context", () => {
  /**
   * For any factory method (createDataSource, createReadStrategy, or
   * createWriteStrategy) that throws during runtime composition, the
   * resulting error SHALL expose a `sourceName` field equal to the
   * configured source name, an `adapterName` field equal to the adapter
   * name, a `cause` property preserving the original thrown error, and a
   * `message` containing both the source name and adapter name as substrings.
   */

  it("wraps createDataSource failure in RuntimeConstructionError with correct context", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (sourceName, adapterName) => {
          const originalError = new Error("createDataSource-failure")
          const factory: AdapterFactory = {
            adapterName,
            createDataSource: () => {
              throw originalError
            },
            createReadStrategy: () => ({
              read: async () => ({
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
              }),
            }),
            createWriteStrategy: () => ({
              write: async () => {},
            }),
          }

          try {
            await createLakeQLRuntime({
              config: {
                dataSources: {
                  [sourceName]: {
                    adapter: adapterName,
                    connection: {},
                    paging: { defaultPerPage: 100, maxRecordsPerPage: 2000 },
                  },
                },
                sourcePath: ".",
              },
              adapters: [factory],
              resolveAuth: () => Promise.resolve({}),
            })
            expect.fail("Should have thrown")
          } catch (error) {
            expect(error).toBeInstanceOf(RuntimeConstructionError)
            const rce = error as RuntimeConstructionError
            expect(rce.sourceName).toBe(sourceName)
            expect(rce.adapterName).toBe(adapterName)
            expect(rce.cause).toBe(originalError)
            expect(rce.message).toContain(sourceName)
            expect(rce.message).toContain(adapterName)
          }
        }
      )
    )
  })

  it("wraps createReadStrategy failure in RuntimeConstructionError with correct context", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (sourceName, adapterName) => {
          const originalError = new Error("createReadStrategy-failure")
          const factory: AdapterFactory = {
            adapterName,
            createDataSource: (_config, _name) =>
              makeFakeDataSource(adapterName),
            createReadStrategy: () => {
              throw originalError
            },
            createWriteStrategy: () => ({
              write: async () => {},
            }),
          }

          try {
            await createLakeQLRuntime({
              config: {
                dataSources: {
                  [sourceName]: {
                    adapter: adapterName,
                    connection: {},
                    paging: { defaultPerPage: 100, maxRecordsPerPage: 2000 },
                  },
                },
                sourcePath: ".",
              },
              adapters: [factory],
              resolveAuth: () => Promise.resolve({}),
            })
            expect.fail("Should have thrown")
          } catch (error) {
            expect(error).toBeInstanceOf(RuntimeConstructionError)
            const rce = error as RuntimeConstructionError
            expect(rce.sourceName).toBe(sourceName)
            expect(rce.adapterName).toBe(adapterName)
            expect(rce.cause).toBe(originalError)
            expect(rce.message).toContain(sourceName)
            expect(rce.message).toContain(adapterName)
          }
        }
      )
    )
  })

  it("wraps createWriteStrategy failure in RuntimeConstructionError with correct context", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (sourceName, adapterName) => {
          const originalError = new Error("createWriteStrategy-failure")
          const factory: AdapterFactory = {
            adapterName,
            createDataSource: (_config, _name) =>
              makeFakeDataSource(adapterName),
            createReadStrategy: () => ({
              read: async () => ({
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
              }),
            }),
            createWriteStrategy: () => {
              throw originalError
            },
          }

          try {
            await createLakeQLRuntime({
              config: {
                dataSources: {
                  [sourceName]: {
                    adapter: adapterName,
                    connection: {},
                    writeConfig: { enabled: true },
                    paging: { defaultPerPage: 100, maxRecordsPerPage: 2000 },
                  },
                },
                sourcePath: ".",
              },
              adapters: [factory],
              resolveAuth: () => Promise.resolve({}),
            })
            expect.fail("Should have thrown")
          } catch (error) {
            expect(error).toBeInstanceOf(RuntimeConstructionError)
            const rce = error as RuntimeConstructionError
            expect(rce.sourceName).toBe(sourceName)
            expect(rce.adapterName).toBe(adapterName)
            expect(rce.cause).toBe(originalError)
            expect(rce.message).toContain(sourceName)
            expect(rce.message).toContain(adapterName)
          }
        }
      )
    )
  })
})
