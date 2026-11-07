// oxlint-disable import/no-named-as-default-member
// oxlint-disable typescript/no-explicit-any
// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable eslint/require-unicode-regexp
// oxlint-disable eslint/no-plusplus
// oxlint-disable eslint/prefer-destructuring

import type { AdapterFactory } from "@lakeql/datasource"
import { FakeAdapterFactory } from "@lakeql/datasource/testing"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  DataSourceConfigError,
  DuplicateAdapterError,
  defineConfig,
} from "../src/index"

/**
 * Creates a minimal AdapterDefinition stub with a custom adapter name.
 * Reuses the FakeAdapterFactory method implementations for all factory methods.
 */
function makeAdapterDefinition(name: string) {
  const base = new FakeAdapterFactory()
  return {
    adapterName: name,
    factory: {
      adapterName: name,
      createDataSource: base.createDataSource.bind(base),
      createReadStrategy: base.createReadStrategy.bind(base),
      createWriteStrategy: base.createWriteStrategy.bind(base),
    } as AdapterFactory,
    validateDataSourceConfig: () => {},
  }
}

describe("defineConfig() property-based tests", () => {
  /**
   * Registration acceptance
   *
   * For any array of AdapterDefinitions with unique non-empty names and
   * matching factory.adapterName, defineConfig returns a TypedLakeQLConfig
   * with all adapters identity-preserved in registration order.
   */
  describe("Registration acceptance", () => {
    it("valid adapters with unique names are all accepted and identity-preserved", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(
            fc
              .string({ minLength: 1, maxLength: 20 })
              .filter((s) => s.trim().length > 0),
            { minLength: 1, maxLength: 5 }
          ),
          (names) => {
            const adapters = names.map(makeAdapterDefinition)

            const result = defineConfig({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              adapters: adapters as any,
              dataSources: {},
            })

            // All adapters are present in output
            expect(result.adapters).toHaveLength(adapters.length)

            // Identity preserved in registration order
            for (const [i, adapter] of adapters.entries()) {
              expect(result.adapters[i]).toBe(adapter)
            }
          }
        )
      )
    })
  })

  /**
   * Deterministic output with reference identity
   *
   * Repeated defineConfig() calls with the same input produce deep-equal
   * dataSources for plain-serializable values and preserve identical
   * runtime object references for adapters.
   */
  describe("Deterministic output with reference identity", () => {
    it("repeated calls with same input produce deep-equal dataSources", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(
            fc
              .string({ minLength: 1, maxLength: 10 })
              .filter((s) => s.trim().length > 0),
            { minLength: 1, maxLength: 3 }
          ),
          fc.dictionary(
            fc
              .string({ minLength: 1, maxLength: 10 })
              .filter((s) => /^[a-z]/i.test(s)),
            fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))
          ),
          (adapterNames, connectionProps) => {
            const adapters = adapterNames.map((name) => ({
              adapterName: name,
              factory: {
                adapterName: name,
                createDataSource: () => {},
                createReadStrategy: () => {},
                createWriteStrategy: () => {},
              },
              validateDataSourceConfig: () => {},
            }))

            // Use the first adapter for the data source
            const firstAdapter = adapterNames[0]!
            const input = {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              adapters: adapters as any,
              dataSources: {
                ds: { adapter: firstAdapter, connection: connectionProps },
              },
            }

            const r1 = defineConfig(input)
            const r2 = defineConfig(input)

            // Plain values deep-equal
            expect(r1.dataSources).toStrictEqual(r2.dataSources)
            // Adapter references identical
            for (let i = 0; i < adapters.length; i++) {
              expect(r1.adapters[i]).toBe(r2.adapters[i])
            }
          }
        )
      )
    })
  })

  /**
   * First-failure-in-order reporting
   *
   * When multiple errors exist, the thrown error corresponds to the first
   * invalid entry encountered in deterministic processing order (adapter
   * registration order, then data-source definition order).
   */
  describe("First-failure-in-order reporting", () => {
    it("first duplicate adapter in registration order is always reported", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(
            fc
              .string({ minLength: 1, maxLength: 10 })
              .filter((s) => s.trim().length > 0),
            { minLength: 2, maxLength: 5 }
          ),
          fc.nat(),
          (names, dupSeed) => {
            // Pick one name to duplicate at the end
            const idx = dupSeed % names.length
            const firstDupName = names[idx]!
            const namesWithDup = [...names, firstDupName]

            const adapters = namesWithDup.map(makeAdapterDefinition)

            try {
              defineConfig({
                adapters: adapters as any,
                dataSources: {},
              })
              // Should always throw since we have a duplicate
              return false
            } catch (error: unknown) {
              if (error instanceof DuplicateAdapterError) {
                // Find the first name that appears more than once in processing order
                const seen = new Set<string>()
                for (const name of namesWithDup) {
                  if (seen.has(name)) {
                    expect(error.adapterName).toBe(name)
                    return true
                  }
                  seen.add(name)
                }
              }
              return false
            }
          }
        )
      )
    })

    it("first invalid data source in definition order is reported", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(
            fc
              .string({ minLength: 1, maxLength: 10 })
              .filter((s) => /^[a-z]/i.test(s)),
            { minLength: 2, maxLength: 5 }
          ),
          (sourceNames) => {
            const adapter = makeAdapterDefinition("valid")

            // All data sources reference an unknown adapter — each would fail
            const dataSources: Record<string, unknown> = {}
            for (const name of sourceNames) {
              dataSources[name] = { adapter: "nonexistent", connection: {} }
            }

            try {
              defineConfig({
                adapters: [adapter] as any,
                dataSources: dataSources as any,
              })
              return false
            } catch (error: unknown) {
              if (error instanceof DataSourceConfigError) {
                // Should be the first source name in Object.keys order
                const firstKey = Object.keys(dataSources)[0]
                expect(error.sourceName).toBe(firstKey)
                return true
              }
              return false
            }
          }
        )
      )
    })
  })
})
