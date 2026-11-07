// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects
// oxlint-disable vitest/prefer-each
// oxlint-disable unicorn/no-useless-undefined

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { DataSourceErrorCategory } from "../../src/errors/index"
import {
  AuthenticationError,
  CancellationError,
  DataSourceError,
  NetworkError,
  QueryExecutionError,
  TimeoutError,
  UnsupportedOperationError,
} from "../../src/errors/index"

/**
 * Subclass descriptors used to drive property tests across all
 * category-specific DataSourceError subclasses.
 */
const standardSubclasses = [
  {
    name: "QueryExecutionError",
    category: "query" as const,
    build: (
      msg: string,
      adapter: string,
      ds: string,
      opts?: { cause?: unknown }
    ) => new QueryExecutionError(msg, adapter, ds, opts),
  },
  {
    name: "AuthenticationError",
    category: "auth" as const,
    build: (
      msg: string,
      adapter: string,
      ds: string,
      opts?: { cause?: unknown }
    ) => new AuthenticationError(msg, adapter, ds, opts),
  },
  {
    name: "NetworkError",
    category: "network" as const,
    build: (
      msg: string,
      adapter: string,
      ds: string,
      opts?: { cause?: unknown }
    ) => new NetworkError(msg, adapter, ds, opts),
  },
  {
    name: "TimeoutError",
    category: "timeout" as const,
    build: (
      msg: string,
      adapter: string,
      ds: string,
      opts?: { cause?: unknown }
    ) => new TimeoutError(msg, adapter, ds, opts),
  },
  {
    name: "CancellationError",
    category: "cancelled" as const,
    build: (
      msg: string,
      adapter: string,
      ds: string,
      opts?: { cause?: unknown }
    ) => new CancellationError(msg, adapter, ds, opts),
  },
] as const

/** Arbitrary cause values spanning undefined, null, primitives, and Error. */
const arbCause = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(new Error("test cause")),
  fc.constant(0),
  fc.constant(""),
  fc.constant(false)
)

/**
 * For any DataSourceError subclass, any valid adapter name string,
 * any dataSource string, and any message string, constructing the
 * subclass SHALL produce an instance whose `category` is the
 * class-defined fixed value, whose `adapter` and `dataSource`
 * match the constructor arguments, whose `message` matches the
 * constructor argument, and whose class-specific fields match
 * their constructor arguments.
 */
describe("Error subclass construction invariants", () => {
  for (const sub of standardSubclasses) {
    it(`${sub.name} fixes category to "${sub.category}" and preserves adapter, dataSource, message`, () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.string(),
          fc.string(),
          (message, adapter, dataSource) => {
            const error = sub.build(message, adapter, dataSource)

            expect(error.category).toBe(sub.category)
            expect(error.adapter).toBe(adapter)
            expect(error.dataSource).toBe(dataSource)
            expect(error.message).toBe(message)
            expect(error).toBeInstanceOf(DataSourceError)
            expect(error).toBeInstanceOf(Error)
          }
        )
      )
    })
  }

  it("DataSourceError preserves adapter, dataSource, message, and category", () => {
    const categories: DataSourceErrorCategory[] = [
      "auth",
      "query",
      "network",
      "timeout",
      "cancelled",
      "unsupported",
    ]

    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        fc.constantFrom(...categories),
        (message, adapter, dataSource, category) => {
          const error = new DataSourceError(
            message,
            adapter,
            dataSource,
            category
          )

          expect(error.category).toBe(category)
          expect(error.adapter).toBe(adapter)
          expect(error.dataSource).toBe(dataSource)
          expect(error.message).toBe(message)
          expect(error).toBeInstanceOf(Error)
        }
      )
    )
  })

  it("UnsupportedOperationError fixes category to 'unsupported' and preserves operation", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        fc.string(),
        (message, adapter, dataSource, operation) => {
          const error = new UnsupportedOperationError(
            message,
            adapter,
            dataSource,
            operation
          )

          expect(error.category).toBe("unsupported")
          expect(error.adapter).toBe(adapter)
          expect(error.dataSource).toBe(dataSource)
          expect(error.message).toBe(message)
          expect(error.operation).toBe(operation)
          expect(error).toBeInstanceOf(DataSourceError)
          expect(error).toBeInstanceOf(Error)
        }
      )
    )
  })
})

/**
 * For any cause value (including `undefined`, `null`, primitive
 * values, and Error instances), constructing a DataSourceError
 * subclass with that cause via the standard `Error(message,
 * { cause })` mechanism SHALL produce an instance whose
 * `Error.cause` is strictly equal to the input cause.
 */
describe("Error cause round-trip", () => {
  for (const sub of standardSubclasses) {
    it(`${sub.name} preserves cause via strict reference equality`, () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.string(),
          fc.string(),
          arbCause,
          (message, adapter, dataSource, cause) => {
            const error = sub.build(message, adapter, dataSource, { cause })

            expect(error.cause).toBe(cause)
          }
        )
      )
    })
  }

  it("DataSourceError preserves cause via strict reference equality", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        arbCause,
        (message, adapter, dataSource, cause) => {
          const error = new DataSourceError(
            message,
            adapter,
            dataSource,
            "query",
            { cause }
          )

          expect(error.cause).toBe(cause)
        }
      )
    )
  })

  it("UnsupportedOperationError preserves cause via strict reference equality", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        fc.string(),
        arbCause,
        (message, adapter, dataSource, operation, cause) => {
          const error = new UnsupportedOperationError(
            message,
            adapter,
            dataSource,
            operation,
            { cause }
          )

          expect(error.cause).toBe(cause)
        }
      )
    )
  })

  it("cause is undefined when no options are provided", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        (message, adapter, dataSource) => {
          const error = new QueryExecutionError(message, adapter, dataSource)

          expect(error.cause).toBeUndefined()
        }
      )
    )
  })
})
