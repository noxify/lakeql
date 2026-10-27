import type { AdapterFactory } from "@lakeql/datasource"
import { FakeAdapterFactory } from "@lakeql/datasource/testing"
import { describe, expect, it } from "vitest"

import {
  AdapterRegistry,
  DuplicateAdapterError,
  UnknownAdapterError,
} from "../src/index"

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

/**
 * Extracts the DuplicateAdapterError thrown during construction.
 */
function catchDuplicateError(
  factories: AdapterFactory[]
): DuplicateAdapterError {
  try {
    const _registry = new AdapterRegistry(factories)
    void _registry
  } catch (error: unknown) {
    return error as DuplicateAdapterError
  }
  throw new Error("Expected DuplicateAdapterError to be thrown")
}

/**
 * Extracts the UnknownAdapterError thrown by getOrThrow.
 */
function catchUnknownError(
  registry: AdapterRegistry,
  name: string
): UnknownAdapterError {
  try {
    registry.getOrThrow(name)
  } catch (error: unknown) {
    return error as UnknownAdapterError
  }
  throw new Error("Expected UnknownAdapterError to be thrown")
}

describe("AdapterRegistry edge cases", () => {
  describe("empty registry", () => {
    it("list() returns empty array", () => {
      const registry = new AdapterRegistry([])
      expect(registry.list()).toStrictEqual([])
    })

    it("get() returns undefined for any name", () => {
      const registry = new AdapterRegistry([])
      expect(registry.get("trino")).toBeUndefined()
      expect(registry.get("fabric")).toBeUndefined()
      expect(registry.get("")).toBeUndefined()
    })

    it("getOrThrow() throws UnknownAdapterError with empty-registry message", () => {
      const registry = new AdapterRegistry([])

      expect(() => registry.getOrThrow("trino")).toThrow(UnknownAdapterError)

      const error = catchUnknownError(registry, "trino")
      expect(error.message).toContain("trino")
      expect(error.message).toContain("no adapters are registered")
    })
  })

  describe("single adapter", () => {
    it("lookup succeeds with exact reference", () => {
      const factory = makeFactory("trino")
      const registry = new AdapterRegistry([factory])

      expect(registry.get("trino")).toBe(factory)
      expect(registry.getOrThrow("trino")).toBe(factory)
    })

    it("list has one element", () => {
      const factory = makeFactory("trino")
      const registry = new AdapterRegistry([factory])

      const names = registry.list()
      expect(names).toStrictEqual(["trino"])
    })
  })

  describe("duplicate detection", () => {
    it("throws DuplicateAdapterError for two factories with same name", () => {
      const a = makeFactory("trino")
      const b = makeFactory("trino")

      expect(() => new AdapterRegistry([a, b])).toThrow(DuplicateAdapterError)
    })

    it("error is instanceof DuplicateAdapterError", () => {
      const error = catchDuplicateError([
        makeFactory("trino"),
        makeFactory("trino"),
      ])
      expect(error).toBeInstanceOf(DuplicateAdapterError)
    })

    it("error name is 'DuplicateAdapterError'", () => {
      const error = catchDuplicateError([
        makeFactory("trino"),
        makeFactory("trino"),
      ])
      expect(error.name).toBe("DuplicateAdapterError")
    })

    it("error message contains the duplicate name", () => {
      const error = catchDuplicateError([
        makeFactory("fabric"),
        makeFactory("fabric"),
      ])
      expect(error.message).toContain("fabric")
    })

    it("error exposes the conflicting adapterName property", () => {
      const error = catchDuplicateError([
        makeFactory("fabric"),
        makeFactory("fabric"),
      ])
      expect(error.adapterName).toBe("fabric")
    })
  })

  describe("unknown adapter error", () => {
    it("is instanceof UnknownAdapterError", () => {
      const registry = new AdapterRegistry([makeFactory("trino")])
      const error = catchUnknownError(registry, "missing")
      expect(error).toBeInstanceOf(UnknownAdapterError)
    })

    it("has name 'UnknownAdapterError'", () => {
      const registry = new AdapterRegistry([makeFactory("trino")])
      const error = catchUnknownError(registry, "missing")
      expect(error.name).toBe("UnknownAdapterError")
    })

    it("message contains requested and registered names", () => {
      const registry = new AdapterRegistry([
        makeFactory("trino"),
        makeFactory("fabric"),
      ])
      const error = catchUnknownError(registry, "postgres")
      expect(error.message).toContain("postgres")
      expect(error.message).toContain("trino")
      expect(error.message).toContain("fabric")
    })

    it("message omits empty-registry indication when adapters are registered", () => {
      const registry = new AdapterRegistry([makeFactory("trino")])
      const error = catchUnknownError(registry, "missing")
      expect(error.message).not.toContain("no adapters are registered")
    })

    it("mutating registeredAdapterNames does not alter stored snapshot", () => {
      const registry = new AdapterRegistry([
        makeFactory("trino"),
        makeFactory("fabric"),
      ])
      const error = catchUnknownError(registry, "missing")

      // The array is frozen, so mutation attempts throw in strict mode
      expect(() => {
        ;(error.registeredAdapterNames as string[])[0] = "corrupted"
      }).toThrow(TypeError)

      expect(() => {
        ;(error.registeredAdapterNames as string[]).push("injected")
      }).toThrow(TypeError)

      // Snapshot remains intact
      expect(error.registeredAdapterNames).toStrictEqual(["trino", "fabric"])
    })

    it("exposes adapterName matching the requested name", () => {
      const registry = new AdapterRegistry([makeFactory("trino")])
      const error = catchUnknownError(registry, "postgres")
      expect(error.adapterName).toBe("postgres")
    })

    it("exposes registeredAdapterNames in registration order", () => {
      const registry = new AdapterRegistry([
        makeFactory("fabric"),
        makeFactory("trino"),
        makeFactory("mongo"),
      ])
      const error = catchUnknownError(registry, "missing")
      expect(error.registeredAdapterNames).toStrictEqual([
        "fabric",
        "trino",
        "mongo",
      ])
    })
  })
})
