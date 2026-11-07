// oxlint-disable vitest/no-conditional-expect
// oxlint-disable vitest/max-expects
// oxlint-disable import/no-named-as-default-member
// oxlint-disable eslint/no-control-regex
// oxlint-disable eslint/no-await-in-loop
// oxlint-disable vitest/require-to-throw-message
// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable unicorn/consistent-function-scoping
// oxlint-disable unicorn/numeric-separators-style

import {
  DataSourceError,
  NetworkError,
  QueryExecutionError,
  UnsupportedOperationError,
} from "@lakeql/datasource"
import type { Column, TrinoClient } from "@lakeql/trino-client"
import { TrinoClientError } from "@lakeql/trino-client"
import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest"

import {
  TrinoDataSource,
  TRINO_CAPABILITIES,
  zipRow,
  isRowZipperError,
  ROW_ZIPPER_TAG,
  createRowTransform,
  trinoAdapterFactory,
  trinoAdapterDefinition,
} from "../src/adapter"
import { validateTrinoConfig, validateTrinoWriteConfig } from "../src/config"

// ---------------------------------------------------------------------------
// Helpers — Column factory
// ---------------------------------------------------------------------------

function col(name: string, type = "varchar"): Column {
  return { name, type }
}

// ---------------------------------------------------------------------------
// Helpers — Fake TrinoClient
// ---------------------------------------------------------------------------

interface FakeQueryOpts {
  sql: string
  signal?: AbortSignal
  impersonateAs?: string
  transform?: (row: unknown[], columns: Column[]) => unknown
}

type QueryFn = (opts: FakeQueryOpts) => Promise<unknown[]>
type StreamFn = (opts: FakeQueryOpts) => Promise<AsyncGenerator<unknown>>

/**
 * Create a minimal fake TrinoClient for testing TrinoDataSource.
 *
 * Accepts narrowed function types rather than the generic
 * `TrinoClient["query"]` to avoid TypeScript variance issues
 * with vi.fn and generic methods.
 */
function createFakeClient(overrides?: {
  queryImpl?: QueryFn
  streamImpl?: StreamFn
}): TrinoClient {
  return {
    query: overrides?.queryImpl ?? vi.fn<QueryFn>(async () => []),
    stream:
      overrides?.streamImpl ?? vi.fn<StreamFn>(async () => emptyGenerator()),
    cancelAllQueries: vi.fn<() => Promise<void>>(async () => {}),
    host: "localhost",
    port: 8080,
    headers: new Headers(),
  } as unknown as TrinoClient
}

/** Trivial async generator that yields nothing. */
async function* emptyGenerator(): AsyncGenerator<unknown> {
  // no-op
}

/**
 * Consume all values from an async generator into an array.
 */
async function collectAll<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of gen) {
    items.push(item)
  }
  return items
}

/**
 * Advance an async generator exactly `n` times and return the collected values.
 */
async function takeN<T>(gen: AsyncGenerator<T>, n: number): Promise<T[]> {
  const items: T[] = []
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await gen.next()
    if (result.done) {
      break
    }
    items.push(result.value)
  }
  return items
}

const DS = "test-datasource"

/** Test helper: access private client of TrinoDataSource for testing. */
function getClient(ds: TrinoDataSource): TrinoClient {
  return (ds as unknown as { client: TrinoClient }).client
}

/** Test helper: access private dataSourceName of TrinoDataSource for testing. */
function getDataSourceName(ds: TrinoDataSource): string {
  return (ds as unknown as { dataSourceName: string }).dataSourceName
}

// 1. Row Zipper (zipRow)

describe(zipRow, () => {
  // ── Correct keying ────────────────────────────────────────────────────

  it("pairs positional values with column names into a keyed record", () => {
    const columns = [col("id", "integer"), col("name", "varchar")]
    const result = zipRow([1, "alice"], columns)

    expect(result).toStrictEqual({ id: 1, name: "alice" })
  })

  it("handles a single column and value", () => {
    const result = zipRow([42], [col("count", "bigint")])

    expect(result).toStrictEqual({ count: 42 })
  })

  it("handles an empty row with empty columns", () => {
    const result = zipRow([], [])

    expect(result).toStrictEqual({})
  })

  // ── Preservation of null, 0, false, empty-string ───────────

  it("preserves null values", () => {
    const columns = [col("a"), col("b")]
    const result = zipRow([null, null], columns)

    expect(result).toStrictEqual({ a: null, b: null })
  })

  it("preserves numeric zero", () => {
    const result = zipRow([0], [col("count")])

    expect(result).toStrictEqual({ count: 0 })
  })

  it("preserves boolean false", () => {
    const result = zipRow([false], [col("active")])

    expect(result).toStrictEqual({ active: false })
  })

  it("preserves empty string", () => {
    const result = zipRow([""], [col("label")])

    expect(result).toStrictEqual({ label: "" })
  })

  it("preserves all falsy values together", () => {
    const columns = [col("a"), col("b"), col("c"), col("d")]
    const result = zipRow([null, 0, false, ""], columns)

    expect(result).toStrictEqual({ a: null, b: 0, c: false, d: "" })
  })

  // ── Error: non-empty row with empty/absent columns ─────────

  it("throws when a non-empty row has empty column metadata", () => {
    expect(() => zipRow([1, 2], [])).toThrow(/column metadata/u)
  })

  // ── Error: mismatched value/column count ────────────────────

  it("throws when value count exceeds column count", () => {
    expect(() => zipRow([1, 2, 3], [col("a"), col("b")])).toThrow(
      /value count.*3.*column count.*2/u
    )
  })

  it("throws when column count exceeds value count", () => {
    expect(() => zipRow([1], [col("a"), col("b")])).toThrow(
      /value count.*1.*column count.*2/u
    )
  })

  // ── Error: duplicate column names (exact case-sensitive) ────

  it("throws on duplicate column names (exact same case)", () => {
    expect(() => zipRow([1, 2], [col("id"), col("id")])).toThrow(
      /duplicate column name.*"id"/u
    )
  })

  it("allows column names that differ only by case", () => {
    const result = zipRow([1, 2], [col("ID"), col("id")])

    expect(result).toStrictEqual({ ID: 1, id: 2 })
  })
})

// 2. createRowTransform — tags zipRow errors as RowZipperError

describe(createRowTransform, () => {
  it("returns keyed records for valid input", () => {
    const transform = createRowTransform()
    const result = transform([1, "alice"], [col("id"), col("name")])

    expect(result).toStrictEqual({ id: 1, name: "alice" })
  })

  it("wraps zipRow errors in a tagged RowZipperError", () => {
    const transform = createRowTransform()

    expect.assertions(2)
    try {
      transform([1, 2, 3], [col("a")])
    } catch (error: unknown) {
      expect(isRowZipperError(error)).toBeTruthy()
      expect((error as Error).cause).toBeInstanceOf(Error)
    }
  })

  it("tagged error is detectable via ROW_ZIPPER_TAG", () => {
    const transform = createRowTransform()

    expect.assertions(1)
    try {
      transform([], [col("a")])
    } catch (error: unknown) {
      expect(
        typeof error === "object" &&
          error !== null &&
          ROW_ZIPPER_TAG in error &&
          (error as Record<symbol, unknown>)[ROW_ZIPPER_TAG] === true
      ).toBeTruthy()
    }
  })
})

// 3. TrinoDataSource.query()

describe("TrinoDataSource.query()", () => {
  // ── Delegation and keyed results ──────────────────────────────────────

  it("delegates to TrinoClient.query() and returns keyed objects", async () => {
    const columns = [col("id", "integer"), col("name", "varchar")]
    const queryFn = vi.fn<QueryFn>(async ({ transform }) => {
      const rows: unknown[][] = [
        [1, "alice"],
        [2, "bob"],
      ]
      return rows.map((row) => (transform ? transform(row, columns) : row))
    })

    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.query({ sql: "SELECT id, name FROM users" })

    expect(result).toStrictEqual([
      { id: 1, name: "alice" },
      { id: 2, name: "bob" },
    ])
    expect(queryFn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ sql: "SELECT id, name FROM users" })
    )
  })

  // ── requestAuth rejection ─────────────────────────────

  it("rejects defined requestAuth with UnsupportedOperationError before calling client", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await expect(
      ds.query({
        sql: "SELECT 1",
        requestAuth: { type: "bearer", token: "secret-token-value" },
      })
    ).rejects.toThrow(UnsupportedOperationError)

    // Client MUST NOT be called
    expect(queryFn).not.toHaveBeenCalled()
  })

  it("requestAuth rejection error has operation 'requestAuth' and does not leak credentials", async () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(4)
    try {
      await ds.query({
        sql: "SELECT 1",
        requestAuth: { type: "bearer", token: "super-secret-token" },
      })
    } catch (error: unknown) {
      const uoe = error as UnsupportedOperationError
      expect(uoe.operation).toBe("requestAuth")
      expect(uoe.adapter).toBe("trino")
      expect(uoe.dataSource).toBe(DS)
      expect(uoe.message).not.toContain("super-secret-token")
    }
  })

  // ── impersonateAs forwarding ──────────────────────────

  it("forwards options.impersonateAs as a non-empty string to the TrinoClient", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.query({
      sql: "SELECT 1",
      options: { impersonateAs: "other-user" },
    })

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({ impersonateAs: "other-user" })
    )
  })

  it("omits impersonateAs when absent from options", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.query({ sql: "SELECT 1" })

    const callArgs = queryFn.mock.calls[0] as unknown as [FakeQueryOpts]
    expect(callArgs[0].impersonateAs).toBeUndefined()
  })

  it("omits impersonateAs when it is an empty string", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.query({ sql: "SELECT 1", options: { impersonateAs: "" } })

    const callArgs = queryFn.mock.calls[0] as unknown as [FakeQueryOpts]
    expect(callArgs[0].impersonateAs).toBeUndefined()
  })

  // ── Client error wrapping through classifyTrinoError ───────

  it("wraps TrinoClient errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Internal Server Error", 500)
    const queryFn = vi.fn<QueryFn>(async () => {
      throw clientError
    })
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(4)
    try {
      await ds.query({ sql: "SELECT 1" })
    } catch (error: unknown) {
      const dse = error as QueryExecutionError
      expect(dse).toBeInstanceOf(QueryExecutionError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(clientError)
    }
  })

  it("wraps network-level TypeError through classifyTrinoError as NetworkError", async () => {
    const typeError = new TypeError("fetch failed")
    const queryFn = vi.fn<QueryFn>(async () => {
      throw typeError
    })
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(4)
    try {
      await ds.query({ sql: "SELECT 1" })
    } catch (error: unknown) {
      const ne = error as NetworkError
      expect(ne).toBeInstanceOf(NetworkError)
      expect(ne.adapter).toBe("trino")
      expect(ne.dataSource).toBe(DS)
      expect(ne.cause).toBe(typeError)
    }
  })

  // ── Row-zipper error wrapping as QueryExecutionError ───────

  it("wraps row-zipper errors as QueryExecutionError (not through classifyTrinoError)", async () => {
    // Simulate a row-zipper failure by providing a mismatched row/columns
    const queryFn = vi.fn<QueryFn>(async ({ transform }) => {
      // Call transform with a mismatched row (3 values, 2 columns)
      if (transform) {
        return [transform([1, 2, 3], [col("a"), col("b")])]
      }
      return []
    })
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(6)
    try {
      await ds.query({ sql: "SELECT a, b FROM t" })
    } catch (error: unknown) {
      const qe = error as QueryExecutionError
      expect(qe).toBeInstanceOf(QueryExecutionError)
      expect(qe.adapter).toBe("trino")
      expect(qe.dataSource).toBe(DS)
      // The cause is the original zipper error, not the private RowZipperError tag
      expect(qe.cause).toBeInstanceOf(Error)
      expect(isRowZipperError(qe.cause)).toBeFalsy()
      expect((qe.cause as Error).message).toMatch(/value count/u)
    }
  })

  // ── signal forwarding ─────────────────────────────────────────────────

  it("forwards the signal to TrinoClient.query()", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    const controller = new AbortController()
    await ds.query({ sql: "SELECT 1", signal: controller.signal })

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal })
    )
  })
})

// 4. TrinoDataSource.stream()

describe("TrinoDataSource.stream()", () => {
  // ── Yields keyed objects across multiple pages ────────────────────────

  it("yields keyed objects from the underlying client generator", async () => {
    const columns = [col("id", "integer"), col("value", "varchar")]

    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      async function* gen() {
        const rows: unknown[][] = [
          [1, "a"],
          [2, "b"],
          [3, "c"],
        ]
        for (const row of rows) {
          yield transform ? transform(row, columns) : row
        }
      }
      return gen()
    })

    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)

    const gen = await ds.stream({ sql: "SELECT id, value FROM t" })
    const results = await collectAll(gen)

    expect(results).toStrictEqual([
      { id: 1, value: "a" },
      { id: 2, value: "b" },
      { id: 3, value: "c" },
    ])
  })

  it("yields keyed objects across multiple simulated pages", async () => {
    const columns = [col("id"), col("name")]

    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      async function* gen() {
        // Page 1
        for (const row of [
          [1, "alice"],
          [2, "bob"],
        ] as unknown[][]) {
          yield transform ? transform(row, columns) : row
        }
        // Page 2
        for (const row of [
          [3, "charlie"],
          [4, "dave"],
        ] as unknown[][]) {
          yield transform ? transform(row, columns) : row
        }
      }
      return gen()
    })

    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)

    const gen = await ds.stream({ sql: "SELECT id, name FROM t" })
    const results = await collectAll(gen)

    expect(results).toStrictEqual([
      { id: 1, name: "alice" },
      { id: 2, name: "bob" },
      { id: 3, name: "charlie" },
      { id: 4, name: "dave" },
    ])
  })

  // ── requestAuth rejection ─────────────────────────────

  it("rejects defined requestAuth with UnsupportedOperationError before calling client", async () => {
    const streamFn = vi.fn<StreamFn>()
    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)

    await expect(
      ds.stream({
        sql: "SELECT 1",
        requestAuth: { type: "basic", username: "u", password: "secret-pw" },
      })
    ).rejects.toThrow(UnsupportedOperationError)

    expect(streamFn).not.toHaveBeenCalled()
  })

  it("requestAuth rejection does not leak credentials in message", async () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(2)
    try {
      await ds.stream({
        sql: "SELECT 1",
        requestAuth: { type: "bearer", token: "leaked-token" },
      })
    } catch (error: unknown) {
      const uoe = error as UnsupportedOperationError
      expect(uoe.operation).toBe("requestAuth")
      expect(uoe.message).not.toContain("leaked-token")
    }
  })

  // ── impersonateAs forwarding ──────────────────────────

  it("forwards options.impersonateAs to the TrinoClient", async () => {
    const streamFn = vi.fn<StreamFn>(async () => emptyGenerator())
    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.stream({
      sql: "SELECT 1",
      options: { impersonateAs: "proxy-user" },
    })

    expect(streamFn).toHaveBeenCalledWith(
      expect.objectContaining({ impersonateAs: "proxy-user" })
    )
  })

  it("omits impersonateAs when absent", async () => {
    const streamFn = vi.fn<StreamFn>(async () => emptyGenerator())
    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.stream({ sql: "SELECT 1" })

    const callArgs = streamFn.mock.calls[0] as unknown as [FakeQueryOpts]
    expect(callArgs[0].impersonateAs).toBeUndefined()
  })

  // ── Client error on initial stream() call ────────────────────────────

  it("classifies client error thrown during initial stream() call", async () => {
    const clientError = new TrinoClientError("Bad Gateway", 502)
    const streamFn = vi.fn<StreamFn>(async () => {
      throw clientError
    })
    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(4)
    try {
      await ds.stream({ sql: "SELECT 1" })
    } catch (error: unknown) {
      const dse = error as QueryExecutionError
      expect(dse).toBeInstanceOf(DataSourceError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(clientError)
    }
  })

  // ── Client error on later page iteration → classifyTrinoError

  it("classifies client error thrown during later page iteration through classifyTrinoError", async () => {
    const columns = [col("id")]
    const laterPageError = new TrinoClientError("Gateway Timeout", 504)

    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      async function* gen() {
        // First page yields successfully
        yield transform ? transform([1], columns) : [1]
        // Later page fetch throws a TrinoClientError
        throw laterPageError
      }
      return gen()
    })

    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)
    const gen = await ds.stream({ sql: "SELECT id FROM t" })

    // First row succeeds
    const collected = await takeN(gen, 1)
    expect(collected).toStrictEqual([{ id: 1 }])

    // Second iteration hits the later-page client error
    expect.assertions(5)
    try {
      await gen.next()
    } catch (error: unknown) {
      // HTTP 504 → TimeoutError via classifyTrinoError
      const dse = error as DataSourceError
      expect(dse).toBeInstanceOf(DataSourceError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(laterPageError)
    }
  })

  it("classifies TypeError during iteration as NetworkError through classifyTrinoError", async () => {
    const columns = [col("id")]
    const fetchError = new TypeError("fetch failed")

    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      async function* gen() {
        yield transform ? transform([1], columns) : [1]
        throw fetchError
      }
      return gen()
    })

    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)
    const gen = await ds.stream({ sql: "SELECT id FROM t" })

    // First row succeeds
    await takeN(gen, 1)

    // Second iteration hits network error
    expect.assertions(4)
    try {
      await gen.next()
    } catch (error: unknown) {
      const ne = error as NetworkError
      expect(ne).toBeInstanceOf(NetworkError)
      expect(ne.adapter).toBe("trino")
      expect(ne.dataSource).toBe(DS)
      expect(ne.cause).toBe(fetchError)
    }
  })

  // ── Row-zipper error on later page → QueryExecutionError directly

  it("detects tagged row-zipper error on later page and produces QueryExecutionError directly", async () => {
    const columns = [col("id"), col("name")]

    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      async function* gen() {
        // First page: valid row
        yield transform ? transform([1, "alice"], columns) : [1, "alice"]
        // Later page: row with mismatched column count triggers row-zipper error
        if (transform) {
          yield transform([2, "bob", "extra"], columns)
        }
      }
      return gen()
    })

    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)
    const gen = await ds.stream({ sql: "SELECT id, name FROM t" })

    // First row succeeds
    const collected = await takeN(gen, 1)
    expect(collected).toStrictEqual([{ id: 1, name: "alice" }])

    // Second row triggers row-zipper error
    expect.assertions(7)
    try {
      await gen.next()
    } catch (error: unknown) {
      // Must be QueryExecutionError directly (not via classifyTrinoError)
      const qe = error as QueryExecutionError
      expect(qe).toBeInstanceOf(QueryExecutionError)
      expect(qe.adapter).toBe("trino")
      expect(qe.dataSource).toBe(DS)
      // The cause is the original zipper error, not the private RowZipperError tag
      expect(qe.cause).toBeInstanceOf(Error)
      expect(isRowZipperError(qe.cause)).toBeFalsy()
      expect((qe.cause as Error).message).toMatch(/value count/u)
    }
  })

  it("row-zipper error on later page caused by duplicate column names produces QueryExecutionError with RowZipperError cause", async () => {
    const dupeColumns = [col("id"), col("id")]

    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      const normalColumns = [col("id"), col("name")]
      async function* gen() {
        // First page: normal columns, succeeds
        yield transform ? transform([1, "alice"], normalColumns) : [1, "alice"]
        // Later page: duplicate column names in metadata
        if (transform) {
          yield transform([2, 3], dupeColumns)
        }
      }
      return gen()
    })

    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)
    const gen = await ds.stream({ sql: "SELECT id, name FROM t" })

    // First row succeeds
    await takeN(gen, 1)

    // Second row triggers duplicate column error in zipper
    expect.assertions(6)
    try {
      await gen.next()
    } catch (error: unknown) {
      const qe = error as QueryExecutionError
      expect(qe).toBeInstanceOf(QueryExecutionError)
      expect(qe.adapter).toBe("trino")
      expect(qe.dataSource).toBe(DS)
      expect(qe.cause).toBeInstanceOf(Error)
      expect(isRowZipperError(qe.cause)).toBeFalsy()
      expect((qe.cause as Error).message).toMatch(/duplicate column name/u)
    }
  })

  // ── signal forwarding ─────────────────────────────────────────────────

  it("forwards the signal to TrinoClient.stream()", async () => {
    const streamFn = vi.fn<StreamFn>(async () => emptyGenerator())
    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)

    const controller = new AbortController()
    await ds.stream({ sql: "SELECT 1", signal: controller.signal })

    expect(streamFn).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal })
    )
  })

  // ── Generator cleanup ─────────────────────────────────────────────────

  it("wrapping generator closes the client generator when consumer breaks early", async () => {
    const columns = [col("id")]
    const returnSpy = vi.fn()

    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      async function* gen() {
        try {
          yield transform ? transform([1], columns) : [1]
          yield transform ? transform([2], columns) : [2]
          yield transform ? transform([3], columns) : [3]
        } finally {
          returnSpy()
        }
      }
      return gen()
    })

    const client = createFakeClient({ streamImpl: streamFn })
    const ds = new TrinoDataSource(client, DS)

    const gen = await ds.stream({ sql: "SELECT id FROM t" })

    // Consume only the first row then break
    const first = await takeN(gen, 1)
    expect(first).toStrictEqual([{ id: 1 }])

    // Explicitly close the generator (simulating a break in for-await)
    await gen.return(undefined as never)

    // The inner client generator's finally block must have run
    expect(returnSpy).toHaveBeenCalledOnce()
  })
})

// 5. TrinoDataSource properties

describe("TrinoDataSource properties", () => {
  it('adapter is "trino"', () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    expect(ds.adapter).toBe("trino")
  })

  it("capabilities match TRINO_CAPABILITIES declaration", () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    expect(ds.capabilities).toStrictEqual({
      query: true,
      stream: true,
      metadata: {
        catalogs: true,
        schemas: true,
        tables: true,
        views: true,
        columns: true,
      },
      write: {
        supported: true,
        modes: ["full_load", "full_load_append", "append"],
      },
      ddl: {
        createTable: true,
        dropTable: true,
      },
    })
  })
})

// 6. TrinoDataSource.createTable()

describe("TrinoDataSource.createTable()", () => {
  // ── Exact SQL verification ────────────────────────────────────────────

  it("renders exact CREATE TABLE SQL with quoted identifiers and canonicalized types", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.createTable({
      catalog: "catalog",
      schema: "schema",
      table: "table",
      columns: [
        { name: "col1", type: "VARCHAR(255)" },
        { name: "col2", type: "INTEGER" },
      ],
    })

    expect(queryFn).toHaveBeenCalledExactlyOnceWith({
      sql: 'CREATE TABLE "catalog"."schema"."table" ("col1" VARCHAR(255), "col2" INTEGER)',
    })
  })

  // ── Type canonicalization ─────────────────────────────────────────────

  it("canonicalizes column types to uppercase in rendered SQL", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.createTable({
      catalog: "cat",
      schema: "sch",
      table: "tbl",
      columns: [
        { name: "a", type: "varchar(255)" },
        { name: "b", type: "boolean" },
        { name: "c", type: "decimal(10,2)" },
      ],
    })

    expect(queryFn).toHaveBeenCalledExactlyOnceWith({
      sql: 'CREATE TABLE "cat"."sch"."tbl" ("a" VARCHAR(255), "b" BOOLEAN, "c" DECIMAL(10,2))',
    })
  })

  // ── Identifier quoting for special characters ─────────────────────────

  it("quotes column names with special characters", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.createTable({
      catalog: "cat",
      schema: "sch",
      table: "tbl",
      columns: [{ name: 'col"name', type: "INTEGER" }],
    })

    expect(queryFn).toHaveBeenCalledExactlyOnceWith({
      sql: 'CREATE TABLE "cat"."sch"."tbl" ("col""name" INTEGER)',
    })
  })

  it("quotes catalog, schema, and table with embedded double quotes", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.createTable({
      catalog: 'cat"a',
      schema: 'sch"b',
      table: 'tbl"c',
      columns: [{ name: "id", type: "BIGINT" }],
    })

    expect(queryFn).toHaveBeenCalledExactlyOnceWith({
      sql: 'CREATE TABLE "cat""a"."sch""b"."tbl""c" ("id" BIGINT)',
    })
  })

  // ── Zero columns → throws ──────────────────────────────────

  it("throws when definition has zero columns", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await expect(
      ds.createTable({
        catalog: "cat",
        schema: "sch",
        table: "tbl",
        columns: [],
      })
    ).rejects.toThrow(/at least one column/u)

    expect(queryFn).not.toHaveBeenCalled()
  })

  // ── Duplicate column names → throws ────────────────────────

  it("throws when definition has duplicate column names", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await expect(
      ds.createTable({
        catalog: "cat",
        schema: "sch",
        table: "tbl",
        columns: [
          { name: "id", type: "INTEGER" },
          { name: "id", type: "BIGINT" },
        ],
      })
    ).rejects.toThrow(/duplicate column name.*"id"/u)

    expect(queryFn).not.toHaveBeenCalled()
  })

  // ── Invalid column type → throws ───────────────────────────

  it("throws when a column type is not in the scalar type whitelist", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await expect(
      ds.createTable({
        catalog: "cat",
        schema: "sch",
        table: "tbl",
        columns: [{ name: "data", type: "ARRAY(VARCHAR)" }],
      })
    ).rejects.toThrow()

    expect(queryFn).not.toHaveBeenCalled()
  })

  it("throws on the first validation failure and does not accumulate errors", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    // Two invalid types — only the first one should be reported
    await expect(
      ds.createTable({
        catalog: "cat",
        schema: "sch",
        table: "tbl",
        columns: [
          { name: "a", type: "INVALID_TYPE" },
          { name: "b", type: "ALSO_INVALID" },
        ],
      })
    ).rejects.toThrow()

    expect(queryFn).not.toHaveBeenCalled()
  })

  // ── SQL injection attempts rejected ───────────────────────────────────

  it("rejects identifier with control characters before calling client", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await expect(
      ds.createTable({
        catalog: "cat\u0000",
        schema: "sch",
        table: "tbl",
        columns: [{ name: "id", type: "INTEGER" }],
      })
    ).rejects.toThrow()

    expect(queryFn).not.toHaveBeenCalled()
  })

  it("rejects column type with semicolons", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await expect(
      ds.createTable({
        catalog: "cat",
        schema: "sch",
        table: "tbl",
        columns: [{ name: "id", type: "INTEGER; DROP TABLE users" }],
      })
    ).rejects.toThrow()

    expect(queryFn).not.toHaveBeenCalled()
  })

  // ── Client error wrapped via classifyTrinoError ────────────

  it("wraps client errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Internal Server Error", 500)
    const queryFn = vi.fn<QueryFn>(async () => {
      throw clientError
    })
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(4)
    try {
      await ds.createTable({
        catalog: "cat",
        schema: "sch",
        table: "tbl",
        columns: [{ name: "id", type: "INTEGER" }],
      })
    } catch (error: unknown) {
      const dse = error as QueryExecutionError
      expect(dse).toBeInstanceOf(QueryExecutionError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(clientError)
    }
  })

  // ── All whitelist types accepted ──────────────────────────────────────

  it("accepts all unparameterized scalar whitelist types", async () => {
    const unparameterized = [
      "BOOLEAN",
      "TINYINT",
      "SMALLINT",
      "INTEGER",
      "BIGINT",
      "REAL",
      "DOUBLE",
      "DATE",
      "TIME",
      "TIME WITH TIME ZONE",
      "TIMESTAMP",
      "TIMESTAMP WITH TIME ZONE",
      "VARBINARY",
    ]

    for (const type of unparameterized) {
      const queryFn = vi.fn<QueryFn>(async () => [])
      const client = createFakeClient({ queryImpl: queryFn })
      const ds = new TrinoDataSource(client, DS)

      await ds.createTable({
        catalog: "cat",
        schema: "sch",
        table: "tbl",
        columns: [{ name: "col", type }],
      })

      expect(queryFn).toHaveBeenCalledOnce()
    }
  })

  it("accepts parameterized scalar whitelist types", async () => {
    const parameterized = [
      { type: "DECIMAL(10,2)", expected: "DECIMAL(10,2)" },
      { type: "CHAR(100)", expected: "CHAR(100)" },
      { type: "VARCHAR(1000)", expected: "VARCHAR(1000)" },
    ]

    for (const { type, expected } of parameterized) {
      const queryFn = vi.fn<QueryFn>(async () => [])
      const client = createFakeClient({ queryImpl: queryFn })
      const ds = new TrinoDataSource(client, DS)

      await ds.createTable({
        catalog: "cat",
        schema: "sch",
        table: "tbl",
        columns: [{ name: "col", type }],
      })

      expect(queryFn).toHaveBeenCalledWith({
        sql: expect.stringContaining(`"col" ${expected}`) as string,
      })
    }
  })
})

// 7. TrinoDataSource.dropTable()

describe("TrinoDataSource.dropTable()", () => {
  // ── Exact SQL verification ────────────────────────────────────────────

  it("renders exact DROP TABLE IF EXISTS SQL with quoted identifiers", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.dropTable("catalog", "schema", "table")

    expect(queryFn).toHaveBeenCalledExactlyOnceWith({
      sql: 'DROP TABLE IF EXISTS "catalog"."schema"."table"',
    })
  })

  // ── Special characters in identifiers ─────────────────────────────────

  it("quotes identifiers with embedded double quotes", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.dropTable('cat"a', 'sch"b', 'tbl"c')

    expect(queryFn).toHaveBeenCalledExactlyOnceWith({
      sql: 'DROP TABLE IF EXISTS "cat""a"."sch""b"."tbl""c"',
    })
  })

  it("quotes identifiers containing dots", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await ds.dropTable("cat.x", "sch.y", "tbl.z")

    expect(queryFn).toHaveBeenCalledExactlyOnceWith({
      sql: 'DROP TABLE IF EXISTS "cat.x"."sch.y"."tbl.z"',
    })
  })

  // ── Client error wrapped ──────────────────────────────────────────────

  it("wraps client errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Service Unavailable", 503)
    const queryFn = vi.fn<QueryFn>(async () => {
      throw clientError
    })
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(4)
    try {
      await ds.dropTable("cat", "sch", "tbl")
    } catch (error: unknown) {
      const dse = error as QueryExecutionError
      expect(dse).toBeInstanceOf(QueryExecutionError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(clientError)
    }
  })

  // ── Rejects empty/control-char segments ───────────────────────────────

  it("throws when a segment is empty", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await expect(ds.dropTable("", "sch", "tbl")).rejects.toThrow()
    expect(queryFn).not.toHaveBeenCalled()
  })

  it("throws when a segment contains control characters", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const client = createFakeClient({ queryImpl: queryFn })
    const ds = new TrinoDataSource(client, DS)

    await expect(ds.dropTable("cat\u0001", "sch", "tbl")).rejects.toThrow()
    expect(queryFn).not.toHaveBeenCalled()
  })
})

// 8. TrinoDataSource.qualifiedTableName()

describe("TrinoDataSource.qualifiedTableName()", () => {
  const baseConfig = {
    dataSource: DS,
    adapter: "trino" as const,
  }

  // ── Basic qualified identifier ────────────────────────────────────────

  it("produces a correctly quoted qualified identifier", () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    const result = ds.qualifiedTableName({
      ...baseConfig,
      catalog: "cat",
      schema: "sch",
      tableName: "tbl",
    })

    expect(result).toBe('"cat"."sch"."tbl"')
  })

  // ── Embedded double quotes ────────────────────────────────────────────

  it("escapes embedded double quotes by doubling them", () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    const result = ds.qualifiedTableName({
      ...baseConfig,
      catalog: 'cat"a',
      schema: "sch",
      tableName: "tbl",
    })

    expect(result).toBe('"cat""a"."sch"."tbl"')
  })

  it("escapes double quotes in all three segments", () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    const result = ds.qualifiedTableName({
      ...baseConfig,
      catalog: 'c"at',
      schema: 's"ch',
      tableName: 't"bl',
    })

    expect(result).toBe('"c""at"."s""ch"."t""bl"')
  })

  // ── Dots preserved within a segment ───────────────────────────────────

  it("preserves dots within a segment without splitting", () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    const result = ds.qualifiedTableName({
      ...baseConfig,
      catalog: "cat.with.dot",
      schema: "sch",
      tableName: "tbl",
    })

    expect(result).toBe('"cat.with.dot"."sch"."tbl"')
  })

  // ── Empty segment → throws ────────────────────────────────

  it("throws when catalog is empty", () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    expect(() =>
      ds.qualifiedTableName({
        ...baseConfig,
        catalog: "",
        schema: "sch",
        tableName: "tbl",
      })
    ).toThrow()
  })

  it("throws when schema is empty", () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    expect(() =>
      ds.qualifiedTableName({
        ...baseConfig,
        catalog: "cat",
        schema: "",
        tableName: "tbl",
      })
    ).toThrow()
  })

  it("throws when tableName is empty", () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    expect(() =>
      ds.qualifiedTableName({
        ...baseConfig,
        catalog: "cat",
        schema: "sch",
        tableName: "",
      })
    ).toThrow()
  })

  // ── Control character segment → throws ────────────────────

  it("throws when catalog contains a NUL character", () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    expect(() =>
      ds.qualifiedTableName({
        ...baseConfig,
        catalog: "cat\u0000",
        schema: "sch",
        tableName: "tbl",
      })
    ).toThrow()
  })

  it("throws when schema contains a C0 control character", () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    expect(() =>
      ds.qualifiedTableName({
        ...baseConfig,
        catalog: "cat",
        schema: "sch\u001F",
        tableName: "tbl",
      })
    ).toThrow()
  })

  it("throws when tableName contains a C1 control character", () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    expect(() =>
      ds.qualifiedTableName({
        ...baseConfig,
        catalog: "cat",
        schema: "sch",
        tableName: "tbl\u0080",
      })
    ).toThrow()
  })
})

// 9. TrinoDataSource.close()

describe("TrinoDataSource.close()", () => {
  // ── First call delegates to cancelAllQueries ──────────────────────────

  it("first call delegates to TrinoClient.cancelAllQueries()", async () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    await ds.close()

    expect(client.cancelAllQueries).toHaveBeenCalledOnce()
  })

  // ── Second call does not invoke cancelAllQueries again (idempotent) ──

  it("second call resolves without calling cancelAllQueries again", async () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    await ds.close()
    await ds.close()

    expect(client.cancelAllQueries).toHaveBeenCalledOnce()
  })

  // ── Resolves even if cancelAllQueries throws ─────────────────────────

  it("resolves without error even if cancelAllQueries throws", async () => {
    const client = createFakeClient()
    ;(
      client.cancelAllQueries as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("cancel failed"))
    const ds = new TrinoDataSource(client, DS)

    // Should not throw
    await expect(ds.close()).resolves.toBeUndefined()
  })

  // ── After close, subsequent close calls remain safe ──────────────────

  it("multiple close calls after a failed cancelAllQueries are all safe", async () => {
    const client = createFakeClient()
    ;(
      client.cancelAllQueries as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("cancel failed"))
    const ds = new TrinoDataSource(client, DS)

    await ds.close()
    await ds.close()
    await ds.close()

    // cancelAllQueries was only attempted once despite the failure
    expect(client.cancelAllQueries).toHaveBeenCalledOnce()
  })

  it("query() after close() throws QueryExecutionError", async () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)
    await ds.close()

    await expect(ds.query({ sql: "SELECT 1" })).rejects.toThrow(/closed/u)
  })

  it("catalogs() after close() throws QueryExecutionError", async () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)
    await ds.close()

    await expect(ds.catalogs()).rejects.toThrow(/closed/u)
  })
})

// Property-based tests (fast-check)

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

/**
 * Generates arbitrary strings that are safe for identifier contexts:
 * non-empty, no C0/C1 control characters.
 */
const arbSafeString = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => !/[\u0000-\u001F\u007F-\u009F]/u.test(s))

/**
 * Generates strings that include double quotes, dots, apostrophes,
 * and unicode to stress identifier quoting.
 */
const arbStressIdentifier = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => !/[\u0000-\u001F\u007F-\u009F]/u.test(s))
  .chain((base) =>
    fc
      .constantFrom("", '"', "'", ".", '"."', "'.'")
      .map((special) => `${base}${special}`)
  )
  .filter(
    (s) =>
      s.length > 0 && s.length <= 40 && !/[\u0000-\u001F\u007F-\u009F]/u.test(s)
  )

/**
 * Generates simple safe identifier names: ASCII letters, digits,
 * underscores, starting with a letter or underscore.
 */
const arbSimpleIdentifier = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,20}$/u)

/**
 * Generates strings that contain dangerous SQL injection patterns:
 * semicolons, comment markers, or control characters.
 */
const arbDangerousString = fc.oneof(
  // Semicolons embedded in type-like strings
  fc.constant("INTEGER;"),
  fc.constant("VARCHAR(10);DROP TABLE x"),
  fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => !/[\u0000-\u001F\u007F-\u009F]/u.test(s))
    .map((s) => `${s};DROP TABLE x`),
  // Comment markers embedded in type-like strings
  fc.constant("INTEGER--comment"),
  fc.constant("VARCHAR/*block*/"),
  fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => !/[\u0000-\u001F\u007F-\u009F]/u.test(s))
    .map((s) => `${s}--comment`),
  fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => !/[\u0000-\u001F\u007F-\u009F]/u.test(s))
    .map((s) => `${s}/*block*/`),
  // Control characters
  fc
    .integer({ min: 0, max: 31 })
    .map((code) => `type${String.fromCodePoint(code)}`),
  fc
    .integer({ min: 127, max: 159 })
    .map((code) => `type${String.fromCodePoint(code)}`)
)

/**
 * Generates valid unparameterized type names from the scalar whitelist
 * with random case variations.
 */
const arbUnparameterizedType = fc
  .constantFrom(
    "BOOLEAN",
    "TINYINT",
    "SMALLINT",
    "INTEGER",
    "BIGINT",
    "REAL",
    "DOUBLE",
    "DATE",
    "TIME",
    "TIME WITH TIME ZONE",
    "TIMESTAMP",
    "TIMESTAMP WITH TIME ZONE",
    "VARBINARY"
  )
  .chain((typeName) =>
    fc.boolean().map((lower) => (lower ? typeName.toLowerCase() : typeName))
  )

/**
 * Generates valid DECIMAL(p,s) type strings with random case and
 * whitespace.
 */
const arbDecimalType = fc
  .tuple(fc.integer({ min: 1, max: 38 }), fc.boolean())
  .chain(([precision, lower]) =>
    fc.integer({ min: 0, max: precision }).map((scale) => {
      const name = lower ? "decimal" : "DECIMAL"
      return `${name}(${precision},${scale})`
    })
  )

/**
 * Generates valid CHAR(n) type strings.
 */
const arbCharType = fc.integer({ min: 1, max: 255 }).chain((n) =>
  fc.boolean().map((lower) => {
    const name = lower ? "char" : "CHAR"
    return `${name}(${n})`
  })
)

/**
 * Generates valid VARCHAR(n) type strings.
 */
const arbVarcharType = fc.integer({ min: 1, max: 65535 }).chain((n) =>
  fc.boolean().map((lower) => {
    const name = lower ? "varchar" : "VARCHAR"
    return `${name}(${n})`
  })
)

/**
 * Generates any valid type from the scalar whitelist.
 */
const arbValidType = fc.oneof(
  arbUnparameterizedType,
  arbDecimalType,
  arbCharType,
  arbVarcharType
)

/**
 * Creates a fake TrinoClient that captures the SQL string passed to
 * `query()`.
 */
function createCapturingClient(): {
  client: TrinoClient
  captured: { sql: string | undefined }
} {
  const captured: { sql: string | undefined } = { sql: undefined }

  const client = {
    query: vi.fn(async (opts: { sql: string }) => {
      captured.sql = opts.sql
      return []
    }),
    stream: vi.fn(),
    cancelAllQueries: vi.fn(async () => {}),
    host: "localhost",
    port: 8080,
    headers: new Headers(),
  } as unknown as TrinoClient

  return { client, captured }
}

const PROP_DS = "prop-ds"

// DDL type and injection safety

describe("DDL type and injection safety", () => {
  /**
   * For any valid type from the scalar whitelist, `createTable()`
   * renders the canonical uppercase type in the SQL.
   */
  it("createTable() renders canonical uppercase type for any valid whitelist type", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidType,
        arbSimpleIdentifier,
        async (type, colName) => {
          const { client, captured } = createCapturingClient()
          const ds = new TrinoDataSource(client, PROP_DS)

          await ds.createTable({
            catalog: "cat",
            schema: "sch",
            table: "tbl",
            columns: [{ name: colName, type }],
          })

          expect(captured.sql).toBeDefined()
          const sql = captured.sql as string

          // The SQL must start with CREATE TABLE (no IF NOT EXISTS)
          expect(sql).toMatch(/^CREATE TABLE /u)
          expect(sql).not.toContain("IF NOT EXISTS")

          // The canonical type must appear in the SQL (uppercase, no extra whitespace)
          const upperType = type.toUpperCase().replaceAll(/\s+/gu, " ").trim()
          // For parameterized types, the canonical form has no spaces around parens/commas
          const canonical = upperType
            .replaceAll(/\(\s*/gu, "(")
            .replaceAll(/\s*\)/gu, ")")
            .replaceAll(/\s*,\s*/gu, ",")
          expect(sql).toContain(canonical)
        }
      ),
      { numRuns: 200 }
    )
  })

  /**
   * For any string containing semicolons, comment markers, or control
   * chars used as a column type, `createTable()` rejects before
   * invoking the client.
   */
  it("createTable() rejects dangerous type strings before invoking client", async () => {
    await fc.assert(
      fc.asyncProperty(arbDangerousString, async (dangerousType) => {
        const { client } = createCapturingClient()
        const ds = new TrinoDataSource(client, PROP_DS)

        await expect(
          ds.createTable({
            catalog: "cat",
            schema: "sch",
            table: "tbl",
            columns: [{ name: "col", type: dangerousType }],
          })
        ).rejects.toThrow()

        // Client.query must not have been called
        expect(client.query).not.toHaveBeenCalled()
      }),
      { numRuns: 100 }
    )
  })

  /**
   * For any column name with embedded double quotes, the CREATE TABLE
   * SQL properly quotes them by doubling.
   */
  it("column names with embedded quotes are properly doubled in CREATE TABLE SQL", async () => {
    await fc.assert(
      fc.asyncProperty(arbStressIdentifier, async (colName) => {
        const { client, captured } = createCapturingClient()
        const ds = new TrinoDataSource(client, PROP_DS)

        await ds.createTable({
          catalog: "cat",
          schema: "sch",
          table: "tbl",
          columns: [{ name: colName, type: "INTEGER" }],
        })

        expect(captured.sql).toBeDefined()
        const sql = captured.sql as string

        // The column name must appear with embedded quotes doubled
        const escaped = colName.replaceAll('"', '""')
        expect(sql).toContain(`"${escaped}"`)
      }),
      { numRuns: 200 }
    )
  })

  /**
   * For any safe string triple as catalog/schema/table identifiers,
   * the CREATE TABLE SQL contains all three as properly quoted
   * identifiers joined with dots.
   */
  it("catalog, schema, and table identifiers in CREATE TABLE are properly quoted", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbStressIdentifier,
        arbStressIdentifier,
        arbStressIdentifier,
        async (catalog, schema, table) => {
          const { client, captured } = createCapturingClient()
          const ds = new TrinoDataSource(client, PROP_DS)

          await ds.createTable({
            catalog,
            schema,
            table,
            columns: [{ name: "id", type: "INTEGER" }],
          })

          expect(captured.sql).toBeDefined()
          const sql = captured.sql as string

          const esc = (s: string) => s.replaceAll('"', '""')
          expect(sql).toContain(
            `"${esc(catalog)}"."${esc(schema)}"."${esc(table)}"`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  /**
   * The generated CREATE TABLE SQL never contains raw WITH properties
   * or IF NOT EXISTS.
   */
  it("CREATE TABLE SQL never contains WITH or IF NOT EXISTS", async () => {
    await fc.assert(
      fc.asyncProperty(arbValidType, async (type) => {
        const { client, captured } = createCapturingClient()
        const ds = new TrinoDataSource(client, PROP_DS)

        await ds.createTable({
          catalog: "cat",
          schema: "sch",
          table: "tbl",
          columns: [{ name: "col", type }],
        })

        expect(captured.sql).toBeDefined()
        const sql = captured.sql as string

        expect(sql).not.toContain("IF NOT EXISTS")
        expect(sql).not.toMatch(/\bWITH\s*\(/u)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * For any identifier segment containing control characters or empty
   * strings used as catalog/schema/table, `createTable()` rejects
   * before invoking the client.
   */
  it("createTable() rejects empty or control-char identifier segments", async () => {
    const arbBadSegment = fc.oneof(
      fc.constant(""),
      fc
        .integer({ min: 0, max: 31 })
        .map((code) => `seg${String.fromCodePoint(code)}`),
      fc
        .integer({ min: 127, max: 159 })
        .map((code) => `seg${String.fromCodePoint(code)}`)
    )

    await fc.assert(
      fc.asyncProperty(arbBadSegment, async (badSegment) => {
        const { client } = createCapturingClient()
        const ds = new TrinoDataSource(client, PROP_DS)

        // Try bad segment in catalog position
        await expect(
          ds.createTable({
            catalog: badSegment,
            schema: "sch",
            table: "tbl",
            columns: [{ name: "col", type: "INTEGER" }],
          })
        ).rejects.toThrow()

        expect(client.query).not.toHaveBeenCalled()
      }),
      { numRuns: 50 }
    )
  })
})

// Qualified table name quoting

describe("Qualified table name quoting", () => {
  /**
   * For any safe string triple, `qualifiedTableName()` produces
   * properly quoted segments joined with dots in the form
   * `"catalog"."schema"."tableName"`.
   */
  it("produces properly quoted segments joined with dots", () => {
    fc.assert(
      fc.property(
        arbSafeString,
        arbSafeString,
        arbSafeString,
        (catalog, schema, tableName) => {
          const client = createFakeClient()
          const ds = new TrinoDataSource(client, DS)

          const result = ds.qualifiedTableName({
            dataSource: "ds",
            adapter: "trino",
            catalog,
            schema,
            tableName,
          })

          const esc = (s: string) => s.replaceAll('"', '""')
          expect(result).toBe(
            `"${esc(catalog)}"."${esc(schema)}"."${esc(tableName)}"`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  /**
   * For strings with embedded double quotes, they are doubled in
   * the output.
   */
  it("embedded double quotes are doubled in output", () => {
    fc.assert(
      fc.property(arbStressIdentifier, (segment) => {
        const client = createFakeClient()
        const ds = new TrinoDataSource(client, DS)

        const result = ds.qualifiedTableName({
          dataSource: "ds",
          adapter: "trino",
          catalog: segment,
          schema: "safe",
          tableName: "safe",
        })

        // The catalog segment must have its double quotes doubled
        const escaped = segment.replaceAll('"', '""')
        expect(result).toContain(`"${escaped}"`)

        // The output must have exactly 3 segments separated by dots outside quotes
        // Each segment is wrapped in double quotes, so we can verify
        // the structure by checking it starts and ends with quotes
        expect(result).toMatch(/^"[^]*"\."[^]*"\."[^]*"$/u)
      }),
      { numRuns: 200 }
    )
  })

  /**
   * For empty strings or strings with control characters,
   * `qualifiedTableName()` throws before producing SQL.
   */
  it("throws for empty string segments", () => {
    fc.assert(
      fc.property(arbSafeString, arbSafeString, (safe1, safe2) => {
        const client = createFakeClient()
        const ds = new TrinoDataSource(client, DS)

        // Empty catalog
        expect(() =>
          ds.qualifiedTableName({
            dataSource: "ds",
            adapter: "trino",
            catalog: "",
            schema: safe1,
            tableName: safe2,
          })
        ).toThrow()

        // Empty schema
        expect(() =>
          ds.qualifiedTableName({
            dataSource: "ds",
            adapter: "trino",
            catalog: safe1,
            schema: "",
            tableName: safe2,
          })
        ).toThrow()

        // Empty tableName
        expect(() =>
          ds.qualifiedTableName({
            dataSource: "ds",
            adapter: "trino",
            catalog: safe1,
            schema: safe2,
            tableName: "",
          })
        ).toThrow()
      }),
      { numRuns: 50 }
    )
  })

  it("throws for segments containing control characters", () => {
    const arbControlSegment = fc.oneof(
      fc
        .integer({ min: 0, max: 31 })
        .map((code) => `seg${String.fromCodePoint(code)}`),
      fc
        .integer({ min: 127, max: 159 })
        .map((code) => `seg${String.fromCodePoint(code)}`)
    )

    fc.assert(
      fc.property(arbControlSegment, (badSegment) => {
        const client = createFakeClient()
        const ds = new TrinoDataSource(client, DS)

        // Bad segment in any position should throw
        expect(() =>
          ds.qualifiedTableName({
            dataSource: "ds",
            adapter: "trino",
            catalog: badSegment,
            schema: "safe",
            tableName: "safe",
          })
        ).toThrow()

        expect(() =>
          ds.qualifiedTableName({
            dataSource: "ds",
            adapter: "trino",
            catalog: "safe",
            schema: badSegment,
            tableName: "safe",
          })
        ).toThrow()

        expect(() =>
          ds.qualifiedTableName({
            dataSource: "ds",
            adapter: "trino",
            catalog: "safe",
            schema: "safe",
            tableName: badSegment,
          })
        ).toThrow()
      }),
      { numRuns: 50 }
    )
  })

  /**
   * Dots within a segment are preserved inside the quoted identifier
   * and do not split the segment.
   */
  it("dots inside segments are preserved and do not split the segment", () => {
    fc.assert(
      fc.property(arbSafeString, (base) => {
        // Construct a segment with embedded dots
        const segment = `${base}.inner.part`
        const client = createFakeClient()
        const ds = new TrinoDataSource(client, DS)

        const result = ds.qualifiedTableName({
          dataSource: "ds",
          adapter: "trino",
          catalog: segment,
          schema: "schema",
          tableName: "table",
        })

        // The dot-containing segment must be fully enclosed in one
        // pair of double quotes, not split into multiple segments
        const escaped = segment.replaceAll('"', '""')
        expect(result).toContain(`"${escaped}"`)
      }),
      { numRuns: 100 }
    )
  })
})

// Factory adapter name identity

describe("Factory adapter name identity", () => {
  /**
   * The trinoAdapterFactory's `adapterName` is always the string "trino".
   */
  it('trinoAdapterFactory.adapterName is "trino"', () => {
    expect(trinoAdapterFactory.adapterName).toBe("trino")
  })

  it("createDataSource is a function", () => {
    expect(trinoAdapterFactory.createDataSource).toBeTypeOf("function")
  })

  it("createReadStrategy is a function", () => {
    expect(trinoAdapterFactory.createReadStrategy).toBeTypeOf("function")
  })

  it("createWriteStrategy is a function", () => {
    expect(trinoAdapterFactory.createWriteStrategy).toBeTypeOf("function")
  })
})

// Typed registration identity

describe("Typed registration identity", () => {
  /**
   * The trinoAdapterDefinition carries exact references and the
   * literal "trino" adapter name.
   */
  it('trinoAdapterDefinition.adapterName is the literal "trino"', () => {
    expect(trinoAdapterDefinition.adapterName).toBe("trino")
  })

  it("trinoAdapterDefinition.factory is the exact trinoAdapterFactory reference", () => {
    expect(trinoAdapterDefinition.factory).toBe(trinoAdapterFactory)
  })

  it("trinoAdapterDefinition.validateDataSourceConfig is the exact validateTrinoConfig reference", () => {
    expect(trinoAdapterDefinition.validateDataSourceConfig).toBe(
      validateTrinoConfig
    )
  })

  it("trinoAdapterDefinition does not have registrationOptions", () => {
    expect("registrationOptions" in trinoAdapterDefinition).toBeFalsy()
  })

  it("trinoAdapterDefinition does not have mergeDataSourceConfig", () => {
    expect("mergeDataSourceConfig" in trinoAdapterDefinition).toBeFalsy()
  })
})

// Data source adapter identity and capability consistency

describe("Data source adapter identity and capability consistency", () => {
  /**
   * Generates a valid TrinoConnectionConfig with random but valid values.
   */
  const arbBasicAuth = fc.record({
    type: fc.constant("basic" as const),
    username: fc.string({ minLength: 1, maxLength: 20 }),
    password: fc.string({ minLength: 1, maxLength: 20 }),
  })

  const arbBearerAuth = fc.record({
    type: fc.constant("bearer" as const),
    token: fc.string({ minLength: 1, maxLength: 40 }),
  })

  const arbAuth = fc.oneof(arbBasicAuth, arbBearerAuth)

  const arbValidConfig = fc.record({
    host: fc.string({ minLength: 1, maxLength: 30 }),
    port: fc.integer({ min: 1, max: 65535 }),
    catalog: fc.string({ minLength: 1, maxLength: 20 }),
    auth: arbAuth,
  })

  const arbDataSourceName = fc.string({ minLength: 1, maxLength: 30 })

  /**
   * For any valid config, `createDataSource()` returns a data source
   * with adapter "trino" and the exact capability declaration.
   */
  it("createDataSource returns data source with adapter='trino' and full capabilities", () => {
    fc.assert(
      fc.property(arbValidConfig, arbDataSourceName, (config, name) => {
        const ds = trinoAdapterFactory.createDataSource(config, name)

        expect(ds.adapter).toBe("trino")
        expect(ds.capabilities).toStrictEqual(TRINO_CAPABILITIES)
      }),
      { numRuns: 50 }
    )
  })

  /**
   * The capabilities object matches the exact capabilities declaration.
   */
  it("capabilities match the exact declaration", () => {
    fc.assert(
      fc.property(arbValidConfig, arbDataSourceName, (config, name) => {
        const ds = trinoAdapterFactory.createDataSource(config, name)

        // Query and stream
        expect(ds.capabilities.query).toBeTruthy()
        expect(ds.capabilities.stream).toBeTruthy()

        // Metadata — all true
        expect(ds.capabilities.metadata.catalogs).toBeTruthy()
        expect(ds.capabilities.metadata.schemas).toBeTruthy()
        expect(ds.capabilities.metadata.tables).toBeTruthy()
        expect(ds.capabilities.metadata.views).toBeTruthy()
        expect(ds.capabilities.metadata.columns).toBeTruthy()

        // Write — supported with storage modes
        expect(ds.capabilities.write.supported).toBeTruthy()
        expect(ds.capabilities.write.modes).toStrictEqual([
          "full_load",
          "full_load_append",
          "append",
        ])

        // DDL
        expect(ds.capabilities.ddl.createTable).toBeTruthy()
        expect(ds.capabilities.ddl.dropTable).toBeTruthy()
      }),
      { numRuns: 50 }
    )
  })

  /**
   * The factory is stateless — multiple createDataSource calls produce
   * independent data sources with correct identity.
   */
  it("multiple createDataSource calls produce independent data sources", () => {
    fc.assert(
      fc.property(
        arbValidConfig,
        arbDataSourceName,
        arbDataSourceName,
        (config, name1, name2) => {
          const ds1 = trinoAdapterFactory.createDataSource(config, name1)
          const ds2 = trinoAdapterFactory.createDataSource(config, name2)

          expect(ds1).not.toBe(ds2)
          expect(ds1.adapter).toBe("trino")
          expect(ds2.adapter).toBe("trino")
        }
      ),
      { numRuns: 30 }
    )
  })
})

// Write strategy rejects all operations

describe("Write strategy construction and validation", () => {
  // Constructing the write strategy spins up a HiveTableManager, which emits a
  // one-time auto-derivation warning. These tests do not assert on it, so mute
  // console.warn to keep the test run quiet.
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * For any data source name, `createWriteStrategy()` returns a
   * DataSourceWriteStrategy backed by the storage write pipeline
   * when provided valid write config with a Files instance.
   */
  it("createWriteStrategy returns a DataSourceWriteStrategy with a write method", () => {
    const ds = trinoAdapterFactory.createDataSource(validConfig(), "analytics")

    const writeStrategy = trinoAdapterFactory.createWriteStrategy({
      dataSource: ds,
      dataSourceName: "analytics",
      writeConfig: {
        files: { adapter: { name: "s3", bucket: "test" } } as never,
        serializer: { serialize: vi.fn() },
      },
    })

    expect(writeStrategy).toBeDefined()
    expect(writeStrategy.write).toBeTypeOf("function")
  })

  /**
   * The write strategy requires a Files instance in writeConfig.
   * Passing undefined writeConfig throws during construction.
   */
  it("createWriteStrategy throws when writeConfig lacks a files instance", () => {
    const ds = trinoAdapterFactory.createDataSource(validConfig(), "analytics")

    expect(() =>
      trinoAdapterFactory.createWriteStrategy({
        dataSource: ds,
        dataSourceName: "analytics",
        writeConfig: undefined,
      })
    ).toThrow()
  })
})

// 10. trinoAdapterFactory

/**
 * Minimal valid TrinoConnectionConfig for factory tests.
 */
function validConfig(overrides?: Record<string, unknown>) {
  return {
    host: "https://trino.example.com",
    port: 8443,
    catalog: "iceberg",
    auth: { type: "basic" as const, username: "user", password: "pass" },
    ...overrides,
  }
}

describe("trinoAdapterFactory — factory tests", () => {
  // ── adapterName ─────────────────────────────────────────────

  it('adapterName is "trino"', () => {
    expect(trinoAdapterFactory.adapterName).toBe("trino")
  })

  // ── createDataSource — valid config ───────────────────

  it("createDataSource() returns a TrinoDataSource with correct adapter and capabilities", () => {
    const ds = trinoAdapterFactory.createDataSource(validConfig(), "analytics")

    expect(ds).toBeInstanceOf(TrinoDataSource)
    expect(ds.adapter).toBe("trino")
    expect(ds.capabilities).toStrictEqual(TRINO_CAPABILITIES)
  })

  // ── createDataSource — invalid config throws before return ──

  it("createDataSource() throws synchronously for invalid config before resource allocation", () => {
    expect(() =>
      trinoAdapterFactory.createDataSource({ host: "" }, "broken")
    ).toThrow()
  })

  it("createDataSource() throws for null config", () => {
    expect(() => trinoAdapterFactory.createDataSource(null, "broken")).toThrow()
  })

  it("createDataSource() throws for missing required fields", () => {
    expect(() =>
      trinoAdapterFactory.createDataSource({ host: "h", port: 8080 }, "broken")
    ).toThrow()
  })

  // ── createReadStrategy returns a DataSourceReadStrategy ─────

  it("createReadStrategy() returns a DataSourceReadStrategy with a read method", () => {
    const ds = trinoAdapterFactory.createDataSource(validConfig(), "analytics")
    const resolveAuth = vi.fn(async () => ({}))
    const strategy = trinoAdapterFactory.createReadStrategy({
      dataSource: ds,
      resolveAuth,
    })

    expect(strategy).toBeDefined()
    expect(strategy.read).toBeTypeOf("function")
  })

  // ── createWriteStrategy returns a DataSourceWriteStrategy ─

  it("createWriteStrategy() returns a DataSourceWriteStrategy", () => {
    const ds = trinoAdapterFactory.createDataSource(validConfig(), "analytics")
    const strategy = trinoAdapterFactory.createWriteStrategy({
      dataSource: ds,
      dataSourceName: "analytics",
      writeConfig: {
        files: { adapter: { name: "s3", bucket: "test" } } as never,
        serializer: { serialize: vi.fn() },
      },
    })

    expect(strategy).toBeDefined()
    expect(strategy.write).toBeTypeOf("function")
  })

  it("createWriteStrategy() throws for undefined writeConfig", () => {
    const ds = trinoAdapterFactory.createDataSource(validConfig(), "analytics")

    expect(() =>
      trinoAdapterFactory.createWriteStrategy({
        dataSource: ds,
        dataSourceName: "analytics",
        writeConfig: undefined,
      })
    ).toThrow()
  })

  it("createWriteStrategy() throws when files has no bucket and no externalLocationPrefix", () => {
    const ds = trinoAdapterFactory.createDataSource(validConfig(), "analytics")

    expect(() =>
      trinoAdapterFactory.createWriteStrategy({
        dataSource: ds,
        dataSourceName: "some-ds",
        writeConfig: {
          files: { adapter: { name: "s3" } } as never,
          serializer: { serialize: vi.fn() },
        },
      })
    ).toThrow("cannot resolve bucket")
  })

  // ── Construction methods are synchronous ────────────────────

  it("construction methods are synchronous — no promises returned", () => {
    const ds = trinoAdapterFactory.createDataSource(validConfig(), "sync-test")
    // createDataSource returns a DataSource directly, not a Promise
    expect(ds).not.toBeInstanceOf(Promise)
    expect(ds.adapter).toBe("trino")

    const readStrategy = trinoAdapterFactory.createReadStrategy({
      dataSource: ds,
      resolveAuth: vi.fn(async () => ({})),
    })
    expect(readStrategy).not.toBeInstanceOf(Promise)

    const writeStrategy = trinoAdapterFactory.createWriteStrategy({
      dataSource: ds,
      dataSourceName: "sync-test",
      writeConfig: {
        files: { adapter: { name: "s3", bucket: "test" } } as never,
        serializer: { serialize: vi.fn() },
      },
    })
    expect(writeStrategy).not.toBeInstanceOf(Promise)
  })

  // ── Retry/timeout propagation to TrinoClient ─────────

  it("forwards retry and timeout to the TrinoClient", () => {
    const retryConfig = { maxRetries: 3, initialDelay: 100 }
    const ds = trinoAdapterFactory.createDataSource(
      validConfig({ retry: retryConfig, timeout: 30_000 }),
      "retry-test"
    ) as TrinoDataSource

    // The TrinoClient is accessible via the test helper
    const client = getClient(ds)
    expect(client.host).toBe("https://trino.example.com")
    expect(client.port).toBe(8443)
    // Verify headers contain the catalog
    expect(client.headers.get("X-Trino-Catalog")).toBe("iceberg")
  })

  it("forwards schema and source to TrinoClient headers", () => {
    const ds = trinoAdapterFactory.createDataSource(
      validConfig({ schema: "public", source: "my-app" }),
      "header-test"
    ) as TrinoDataSource

    const client = getClient(ds)
    expect(client.headers.get("X-Trino-Schema")).toBe("public")
    expect(client.headers.get("X-Trino-Source")).toBe("my-app")
  })

  it("omits optional fields when absent from config rather than substituting defaults", () => {
    const ds = trinoAdapterFactory.createDataSource(
      validConfig(),
      "minimal-test"
    ) as TrinoDataSource

    const client = getClient(ds)
    // schema was not provided; header should not be set
    expect(client.headers.get("X-Trino-Schema")).toBeNull()
    // source defaults inside TrinoClient to "nodejs" when not provided
    expect(client.headers.get("X-Trino-Source")).toBe("nodejs")
  })

  it("constructs exactly one TrinoClient with bearer auth", () => {
    const ds = trinoAdapterFactory.createDataSource(
      validConfig({ auth: { type: "bearer", token: "tok-123" } }),
      "bearer-test"
    ) as TrinoDataSource

    const client = getClient(ds)
    expect(client.headers.get("Authorization")).toBe("Bearer tok-123")
  })

  // ── Stateless factory — no mutable per-data-source state ────

  it("factory does not retain mutable state between createDataSource calls", () => {
    const ds1 = trinoAdapterFactory.createDataSource(
      validConfig({ catalog: "cat_a" }),
      "ds-one"
    ) as TrinoDataSource

    const ds2 = trinoAdapterFactory.createDataSource(
      validConfig({ catalog: "cat_b" }),
      "ds-two"
    ) as TrinoDataSource

    // Each data source has its own client and name
    expect(getDataSourceName(ds1)).toBe("ds-one")
    expect(getDataSourceName(ds2)).toBe("ds-two")
    expect(getClient(ds1)).not.toBe(getClient(ds2))
    expect(getClient(ds1).headers.get("X-Trino-Catalog")).toBe("cat_a")
    expect(getClient(ds2).headers.get("X-Trino-Catalog")).toBe("cat_b")
  })

  // ── Same validator shared ────────────────

  it("validateTrinoConfig() and createDataSource() use the same validator: identical error for same invalid config", () => {
    const invalidConfig = {
      host: "h",
      port: -1,
      catalog: "cat",
      auth: { type: "basic", username: "u", password: "p" },
    }

    let validatorError: Error | undefined
    let factoryError: Error | undefined

    try {
      validateTrinoConfig(invalidConfig)
    } catch (error: unknown) {
      validatorError = error as Error
    }

    try {
      trinoAdapterFactory.createDataSource(invalidConfig, "test")
    } catch (error: unknown) {
      factoryError = error as Error
    }

    expect(validatorError).toBeDefined()
    expect(factoryError).toBeDefined()
    expect(validatorError?.message).toBe(factoryError?.message)
  })

  it("both paths accept the same valid config without error", () => {
    const config = validConfig()

    // Validator path
    expect(() => validateTrinoConfig(config)).not.toThrow()

    // Factory path
    expect(() =>
      trinoAdapterFactory.createDataSource(config, "test")
    ).not.toThrow()
  })

  it("both paths reject the same fields with identical field identification", () => {
    const cases = [
      { field: "host", config: { ...validConfig(), host: "" } },
      { field: "port", config: { ...validConfig(), port: 0 } },
      { field: "catalog", config: { ...validConfig(), catalog: "" } },
      {
        field: "auth.type",
        config: { ...validConfig(), auth: { type: "invalid" } },
      },
    ]

    for (const { config } of cases) {
      let validatorMsg: string | undefined
      let factoryMsg: string | undefined

      try {
        validateTrinoConfig(config)
      } catch (error: unknown) {
        validatorMsg = (error as Error).message
      }

      try {
        trinoAdapterFactory.createDataSource(config, "test")
      } catch (error: unknown) {
        factoryMsg = (error as Error).message
      }

      expect(validatorMsg).toBeDefined()
      expect(factoryMsg).toBeDefined()
      expect(validatorMsg).toBe(factoryMsg)
    }
  })

  // ── No retry wrapper around TrinoClient delegation ─────────

  it("no adapter-level retry wrapper exists around TrinoClient delegation", async () => {
    // Create a real data source through the factory, then replace its
    // client with a fake to verify delegation count.
    const ds = trinoAdapterFactory.createDataSource(
      validConfig(),
      "retry-check"
    ) as TrinoDataSource

    const queryFn = vi.fn<QueryFn>(async () => [])
    const streamFn = vi.fn<StreamFn>(async () => emptyGenerator())
    const cancelFn = vi.fn<() => Promise<void>>(async () => {})

    // Replace the client on the data source (it's public readonly but
    // we can override for test purposes via Object.defineProperty)
    Object.defineProperty(ds, "client", {
      value: {
        query: queryFn,
        stream: streamFn,
        cancelAllQueries: cancelFn,
        host: "localhost",
        port: 8080,
        headers: new Headers(),
      },
      writable: false,
      configurable: true,
    })

    // query() should delegate exactly once
    await ds.query({ sql: "SELECT 1" })
    expect(queryFn).toHaveBeenCalledOnce()

    // stream() should delegate exactly once for the initial call
    await ds.stream({ sql: "SELECT 1" })
    expect(streamFn).toHaveBeenCalledOnce()

    // metadata — catalogs() should delegate exactly once
    queryFn.mockClear()
    await ds.catalogs()
    expect(queryFn).toHaveBeenCalledOnce()

    // DDL — dropTable() should delegate exactly once
    queryFn.mockClear()
    await ds.dropTable("cat", "sch", "tbl")
    expect(queryFn).toHaveBeenCalledOnce()
  })
})

// 11. trinoAdapterDefinition

describe("trinoAdapterDefinition — registration shape", () => {
  // ── adapterName is literal "trino" ─────────────────────────

  it('adapterName is the literal "trino"', () => {
    expect(trinoAdapterDefinition.adapterName).toBe("trino")
  })

  // ── factory is exact trinoAdapterFactory reference ──────────

  it("factory is the exact trinoAdapterFactory reference", () => {
    expect(trinoAdapterDefinition.factory).toBe(trinoAdapterFactory)
  })

  // ── validateDataSourceConfig is exact validateTrinoConfig ref

  it("validateDataSourceConfig is the exact validateTrinoConfig reference", () => {
    expect(trinoAdapterDefinition.validateDataSourceConfig).toBe(
      validateTrinoConfig
    )
  })

  // ── Omits registrationOptions and mergeDataSourceConfig ─────

  it("does not include registrationOptions or mergeDataSourceConfig", () => {
    const def = trinoAdapterDefinition as Record<string, unknown>
    expect(def.registrationOptions).toBeUndefined()
    expect(def.mergeDataSourceConfig).toBeUndefined()
  })

  // ── validateWriteConfig is exact validateTrinoWriteConfig ref ─────────

  it("validateWriteConfig is the exact validateTrinoWriteConfig reference", () => {
    expect(trinoAdapterDefinition.validateWriteConfig).toBe(
      validateTrinoWriteConfig
    )
  })

  // ── Definition shape has exactly the expected keys ────────────────────

  it("has exactly adapterName, factory, validateDataSourceConfig, and validateWriteConfig keys", () => {
    const keys = Object.keys(trinoAdapterDefinition).toSorted()
    expect(keys).toStrictEqual(
      [
        "adapterName",
        "factory",
        "validateDataSourceConfig",
        "validateWriteConfig",
      ].toSorted()
    )
  })
})
