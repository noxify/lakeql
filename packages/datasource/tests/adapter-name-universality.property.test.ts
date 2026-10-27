// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects
// oxlint-disable vitest/prefer-each

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  AuthenticationError,
  CancellationError,
  DataSourceError,
  NetworkError,
  QueryExecutionError,
  TimeoutError,
  UnsupportedOperationError,
} from "../src/errors/index"
import { UnsupportedWriteStrategy } from "../src/unsupported-write-strategy"

// ---------------------------------------------------------------------------
// Adapter name arbitrary — covers empty, Unicode, long, novel, and random
// ---------------------------------------------------------------------------

const arbAdapterName = fc.oneof(
  fc.string(),
  fc.constant(""),
  fc.constant("\u{1F3AF}"),
  fc.constant("a".repeat(1000)),
  fc.constant("custom-db"),
  fc.constant("my adapter with spaces")
)

// ---------------------------------------------------------------------------
// Subclass descriptors
// ---------------------------------------------------------------------------

const standardSubclasses = [
  {
    name: "QueryExecutionError",
    build: (adapter: string) => new QueryExecutionError("test", adapter, "ds"),
  },
  {
    name: "AuthenticationError",
    build: (adapter: string) => new AuthenticationError("test", adapter, "ds"),
  },
  {
    name: "NetworkError",
    build: (adapter: string) => new NetworkError("test", adapter, "ds"),
  },
  {
    name: "TimeoutError",
    build: (adapter: string) => new TimeoutError("test", adapter, "ds"),
  },
  {
    name: "CancellationError",
    build: (adapter: string) => new CancellationError("test", adapter, "ds"),
  },
  {
    name: "UnsupportedOperationError",
    build: (adapter: string) =>
      new UnsupportedOperationError("test", adapter, "ds", "op"),
  },
] as const

/**
 * For any arbitrary string used as an adapter name (including empty
 * strings, Unicode strings, long strings, and strings not equal to any
 * production adapter name), all shared packages SHALL accept the value
 * without format validation and process it identically without code
 * changes or special-casing.
 *
 * This file covers `DataSourceError` subclasses and
 * `UnsupportedWriteStrategy` from `@lakeql/datasource`.
 */
describe("Open adapter name universality — @lakeql/datasource", () => {
  it("DataSourceError base class accepts arbitrary adapter names", () => {
    fc.assert(
      fc.property(arbAdapterName, (adapter) => {
        const error = new DataSourceError("msg", adapter, "ds", "query")

        expect(error.adapter).toBe(adapter)
        expect(error).toBeInstanceOf(DataSourceError)
        expect(error).toBeInstanceOf(Error)
      })
    )
  })

  for (const sub of standardSubclasses) {
    it(`${sub.name} accepts arbitrary adapter names`, () => {
      fc.assert(
        fc.property(arbAdapterName, (adapter) => {
          const error = sub.build(adapter)

          expect(error.adapter).toBe(adapter)
          expect(error).toBeInstanceOf(DataSourceError)
          expect(error).toBeInstanceOf(Error)
        })
      )
    })
  }

  it("UnsupportedWriteStrategy accepts arbitrary adapter names", async () => {
    await fc.assert(
      fc.asyncProperty(arbAdapterName, async (adapter) => {
        const strategy = new UnsupportedWriteStrategy({
          adapter,
          dataSource: "ds",
        })

        // Verify construction succeeded — write() rejects but the adapter
        // value on the rejection error must match.
        let rejection: unknown
        try {
          await strategy.write({
            records: [],
            schema: null,
            config: {
              table: {
                catalog: "c",
                schema: "s",
                tableName: "t",
              },
            },
          })
        } catch (error: unknown) {
          rejection = error
        }

        expect(rejection).toBeInstanceOf(UnsupportedOperationError)
        expect((rejection as UnsupportedOperationError).adapter).toBe(adapter)
      })
    )
  })
})
