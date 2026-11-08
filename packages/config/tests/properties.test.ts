// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/no-conditional-expect

import type { AdapterFactory } from "@lakeql/datasource"
import { FakeAdapterFactory } from "@lakeql/datasource/testing"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { AdapterRegistry } from "../src/adapter-registry"
import { DuplicateAdapterError } from "../src/errors/duplicate-adapter-error"
import { UnknownAdapterError } from "../src/errors/unknown-adapter-error"

/**
 * Creates a minimal {@link AdapterFactory} stub with a custom adapter name.
 * Reuses the FakeAdapterFactory method implementations for all factory methods.
 */
function makeFactory(name: string): AdapterFactory {
  const base = new FakeAdapterFactory()
  return {
    adapterName: name,
    createDataSource: base.createDataSource.bind(base),
    createReadStrategy: base.createReadStrategy.bind(base),
    createWriteStrategy: base.createWriteStrategy.bind(base),
  }
}

describe("AdapterRegistry properties", () => {
  describe("Open adapter names are stored and retrievable", () => {
    /**
     * For any set of distinct non-empty strings, constructing a registry
     * from factories bearing those names succeeds, and each factory is
     * retrievable by its name via `get()`.
     */
    it("stores and retrieves factories for any set of distinct non-empty names", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 0 }),
          (names) => {
            const factories = names.map(makeFactory)
            const registry = new AdapterRegistry(factories)
            for (const [i, name] of names.entries()) {
              expect(registry.get(name)).toBe(factories[i])
            }
          }
        )
      )
    })
  })

  describe("Lookup returns exact factory reference", () => {
    /**
     * For any registered AdapterFactory, both `get()` and `getOrThrow()`
     * return the exact same object reference (`===`) that was supplied
     * during construction.
     */
    it("get() and getOrThrow() return the same object reference supplied at construction", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1 }),
          (names) => {
            const factories = names.map(makeFactory)
            const registry = new AdapterRegistry(factories)
            for (const [i, name] of names.entries()) {
              expect(registry.get(name)).toBe(factories[i])
              expect(registry.getOrThrow(name)).toBe(factories[i])
            }
          }
        )
      )
    })
  })

  describe("Absent name produces correct behavior per method", () => {
    /**
     * For any name not present in a registry, `get()` returns `undefined`
     * and `getOrThrow()` throws an `UnknownAdapterError` whose
     * `adapterName` property equals the requested name and whose
     * `registeredAdapterNames` property lists all registered names.
     */
    it("get() returns undefined and getOrThrow() throws UnknownAdapterError for absent names", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 0 }),
          fc.string({ minLength: 1 }),
          (names, absentCandidate) => {
            fc.pre(!names.includes(absentCandidate))

            const factories = names.map(makeFactory)
            const registry = new AdapterRegistry(factories)

            expect(registry.get(absentCandidate)).toBeUndefined()
            expect(() => registry.getOrThrow(absentCandidate)).toThrow(
              UnknownAdapterError
            )

            try {
              registry.getOrThrow(absentCandidate)
            } catch (error) {
              expect(error).toBeInstanceOf(UnknownAdapterError)
              const err = error as UnknownAdapterError
              expect(err.adapterName).toBe(absentCandidate)
              expect([...err.registeredAdapterNames]).toStrictEqual(names)
            }
          }
        )
      )
    })
  })

  describe("Registration order preserved", () => {
    /**
     * For any sequence of factories with distinct names, `list()` returns
     * names in the same order as the input array supplied at construction.
     */
    it("list() returns names in the same order as the input array", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 0 }),
          (names) => {
            const factories = names.map(makeFactory)
            const registry = new AdapterRegistry(factories)
            expect([...registry.list()]).toStrictEqual(names)
          }
        )
      )
    })
  })

  describe("list() result is an immutable snapshot", () => {
    /**
     * For any registry, mutating the array returned by `list()` (push, splice,
     * reassign elements) has no effect on subsequent calls to `list()`,
     * `get()`, or `getOrThrow()`, and repeated calls to `list()` return
     * arrays with identical content and order.
     */
    it("mutating list() result does not affect subsequent calls", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1 }),
          (names) => {
            const factories = names.map(makeFactory)
            const registry = new AdapterRegistry(factories)

            const result = registry.list() as string[]
            result.push("injected")
            result[0] = "replaced"

            expect([...registry.list()]).toStrictEqual(names)
            for (const [i, name] of names.entries()) {
              expect(registry.get(name)).toBe(factories[i])
              expect(registry.getOrThrow(name)).toBe(factories[i])
            }
          }
        )
      )
    })
  })

  describe("Duplicate detection with structured error", () => {
    /**
     * For any input array containing two or more factories whose
     * `adapterName` values are equal by strict string equality,
     * construction throws a `DuplicateAdapterError` whose `adapterName`
     * property matches the first conflicting name detected and whose
     * `message` includes that name as a substring.
     */
    it("construction throws DuplicateAdapterError for any input with duplicate names", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1 }),
          fc.nat(),
          (names, indexSeed) => {
            // Pick a random name to duplicate
            const dupeIndex = indexSeed % names.length
            // oxlint-disable-next-line typescript/no-non-null-assertion -- index guaranteed in bounds
            const dupeName = names[dupeIndex]!

            // Create factories with one duplicate appended
            const factories = [...names.map(makeFactory), makeFactory(dupeName)]

            expect(() => new AdapterRegistry(factories)).toThrow(
              DuplicateAdapterError
            )

            try {
              // oxlint-disable-next-line eslint/no-new -- testing that constructor throws
              new AdapterRegistry(factories)
            } catch (error) {
              expect(error).toBeInstanceOf(DuplicateAdapterError)
              const err = error as DuplicateAdapterError
              expect(err.adapterName).toBe(dupeName)
              expect(err.message).toContain(dupeName)
              expect(err.name).toBe("DuplicateAdapterError")
            }
          }
        )
      )
    })
  })

  describe("UnknownAdapterError exposes requested and registered names with immutable snapshot", () => {
    /**
     * The thrown error has correct `adapterName`, `registeredAdapterNames`
     * matching `list()` order, message containing both requested and
     * registered names, immutable exposed array, and distinguishable
     * empty-registry indication.
     */
    it("error has correct properties, message content, and immutable registeredAdapterNames", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 0 }),
          fc.string({ minLength: 1 }),
          (names, absentCandidate) => {
            fc.pre(!names.includes(absentCandidate))

            const factories = names.map(makeFactory)
            const registry = new AdapterRegistry(factories)

            try {
              registry.getOrThrow(absentCandidate)
            } catch (error) {
              const err = error as UnknownAdapterError
              // adapterName matches the requested name
              expect(err.adapterName).toBe(absentCandidate)
              // registeredAdapterNames matches list() order
              expect([...err.registeredAdapterNames]).toStrictEqual(names)
              // message contains the requested name
              expect(err.message).toContain(absentCandidate)
              // message contains all registered names
              for (const name of names) {
                expect(err.message).toContain(name)
              }
              // empty-registry indication
              if (names.length === 0) {
                expect(err.message).toContain("no adapters are registered")
              } else {
                expect(err.message).not.toContain("no adapters are registered")
              }
              // Mutating exposed array does not alter stored state
              const snapshot = [...err.registeredAdapterNames]
              try {
                ;(err.registeredAdapterNames as string[]).push("mutated")
              } catch {
                // Object.freeze may throw in strict mode — that's fine
              }
              expect([...err.registeredAdapterNames]).toStrictEqual(snapshot)
            }
          }
        )
      )
    })
  })

  describe("Input array mutation safety", () => {
    /**
     * For any factory array used to construct a registry, mutating that
     * array after construction (push, pop, splice, element reassignment)
     * does not change the result of `get()`, `getOrThrow()`, or `list()`.
     */
    it("mutating the factory array after construction does not change registry results", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1 }),
          (names) => {
            const factories = names.map(makeFactory)
            const mutableInput = [...factories]
            const registry = new AdapterRegistry(mutableInput)

            // Mutate the input array
            mutableInput.push(makeFactory("injected-after"))
            mutableInput[0] = makeFactory("replaced-after")
            mutableInput.pop()

            // Registry results unchanged
            expect([...registry.list()]).toStrictEqual(names)
            for (const [i, name] of names.entries()) {
              expect(registry.get(name)).toBe(factories[i])
              expect(registry.getOrThrow(name)).toBe(factories[i])
            }
          }
        )
      )
    })
  })

  describe("Instance isolation", () => {
    /**
     * Two registries constructed from different or identical factory arrays
     * produce results determined solely by their own construction input.
     */
    it("two registries produce results determined solely by their own construction input", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1 }),
          fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1 }),
          (namesA, namesB) => {
            const factoriesA = namesA.map(makeFactory)
            const factoriesB = namesB.map(makeFactory)
            const registryA = new AdapterRegistry(factoriesA)
            const registryB = new AdapterRegistry(factoriesB)

            // Each registry's list is determined solely by its own input
            expect([...registryA.list()]).toStrictEqual(namesA)
            expect([...registryB.list()]).toStrictEqual(namesB)

            // Lookups in one registry are independent of the other
            for (const [i, name] of namesA.entries()) {
              expect(registryA.get(name)).toBe(factoriesA[i])
            }
            for (const [i, name] of namesB.entries()) {
              expect(registryB.get(name)).toBe(factoriesB[i])
            }
          }
        )
      )
    })
  })
})
