// oxlint-disable vitest/max-expects
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable vitest/require-to-throw-message
// oxlint-disable unicorn/consistent-function-scoping
// oxlint-disable import/no-named-as-default-member
// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable eslint/no-await-in-loop
// oxlint-disable eslint/arrow-body-style

/**
 * Conformance tests for TrinoDataSource.
 *
 * These tests verify that the Trino adapter conforms to the shared
 * `DataSource` contract end-to-end with a mocked TrinoClient.
 *
 * Structure:
 *   1. Identity & Capabilities
 *   2. Query contract
 *   3. Stream contract
 *   4. Metadata contract
 *   5. DDL contract
 *   6. Lifecycle contract
 *   7. Error classification at boundary
 */

import {
  AuthenticationError,
  CancellationError,
  DataSourceError,
  NetworkError,
  QueryExecutionError,
  TimeoutError,
  UnsupportedOperationError,
} from "@lakeql/datasource"
import type { Column, TrinoClient } from "@lakeql/trino-client"
import {
  TrinoCancellationError,
  TrinoClientError,
  TrinoQueryError,
  TrinoTimeoutError,
} from "@lakeql/trino-client"
import { describe, expect, vi, it } from "vitest"

import { TrinoDataSource, isRowZipperError } from "../src/adapter"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DS = "conformance-ds"

function col(name: string, type = "varchar"): Column {
  return { name, type }
}

interface FakeQueryOpts {
  sql: string
  signal?: AbortSignal
  impersonateAs?: string
  transform?: (row: unknown[], columns: Column[]) => unknown
}

type QueryFn = (opts: FakeQueryOpts) => Promise<unknown[]>
type StreamFn = (opts: FakeQueryOpts) => Promise<AsyncGenerator<unknown>>

/** Trivial async generator that yields nothing. */
async function* emptyGenerator(): AsyncGenerator<unknown> {
  // no-op
}

/**
 * Create a minimal fake TrinoClient for conformance testing.
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
    const result = await gen.next()
    if (result.done) {
      break
    }
    items.push(result.value)
  }
  return items
}

// 1. Identity & Capabilities

describe("Conformance: Identity & Capabilities", () => {
  it('adapter property is the literal "trino"', () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)
    expect(ds.adapter).toBe("trino")
  })

  it("capabilities.query is true", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)
    expect(ds.capabilities.query).toBeTruthy()
  })

  it("capabilities.stream is true", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)
    expect(ds.capabilities.stream).toBeTruthy()
  })

  it("capabilities.metadata flags are all true", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)
    expect(ds.capabilities.metadata).toStrictEqual({
      catalogs: true,
      schemas: true,
      tables: true,
      views: true,
      columns: true,
    })
  })

  it("capabilities.write.supported is true with storage modes", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)
    expect(ds.capabilities.write).toStrictEqual({
      supported: true,
      modes: ["full_load", "full_load_append", "append"],
    })
  })

  it("capabilities.ddl flags are both true", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)
    expect(ds.capabilities.ddl).toStrictEqual({
      createTable: true,
      dropTable: true,
    })
  })

  it("capabilities are constant after construction", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)
    const first = ds.capabilities
    const second = ds.capabilities
    expect(first).toBe(second)
  })

  it("full capabilities object matches expected shape", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)
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

// 2. Query contract

describe("Conformance: Query contract", () => {
  it("query() returns keyed record objects from positional rows", async () => {
    const columns = [col("id", "integer"), col("name", "varchar")]
    const queryFn = vi.fn<QueryFn>(async ({ transform }) => {
      const rows: unknown[][] = [
        [1, "alice"],
        [2, "bob"],
      ]
      return rows.map((row) => (transform ? transform(row, columns) : row))
    })
    const ds = new TrinoDataSource(createFakeClient({ queryImpl: queryFn }), DS)

    const result = await ds.query({ sql: "SELECT id, name FROM users" })

    expect(result).toStrictEqual([
      { id: 1, name: "alice" },
      { id: 2, name: "bob" },
    ])
  })

  it("query() preserves null, 0, false, and empty-string values", async () => {
    const columns = [col("a"), col("b"), col("c"), col("d")]
    const queryFn = vi.fn<QueryFn>(async ({ transform }) => {
      return [transform!([null, 0, false, ""], columns)]
    })
    const ds = new TrinoDataSource(createFakeClient({ queryImpl: queryFn }), DS)

    const result = await ds.query({ sql: "SELECT a, b, c, d FROM t" })

    expect(result).toStrictEqual([{ a: null, b: 0, c: false, d: "" }])
  })

  it("query() forwards sql to the client", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const ds = new TrinoDataSource(createFakeClient({ queryImpl: queryFn }), DS)

    await ds.query({ sql: "SELECT 1" })

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({ sql: "SELECT 1" })
    )
  })

  it("query() forwards signal to the client", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const ds = new TrinoDataSource(createFakeClient({ queryImpl: queryFn }), DS)
    const controller = new AbortController()

    await ds.query({ sql: "SELECT 1", signal: controller.signal })

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal })
    )
  })

  it("query() rejects defined requestAuth with UnsupportedOperationError before calling client", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const ds = new TrinoDataSource(createFakeClient({ queryImpl: queryFn }), DS)

    await expect(
      ds.query({
        sql: "SELECT 1",
        requestAuth: { type: "bearer", token: "secret" },
      })
    ).rejects.toThrow(UnsupportedOperationError)

    expect(queryFn).not.toHaveBeenCalled()
  })

  it("query() requestAuth rejection has operation 'requestAuth' and credential-safe message", async () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)

    expect.assertions(4)
    try {
      await ds.query({
        sql: "SELECT 1",
        requestAuth: { type: "bearer", token: "my-secret-token" },
      })
    } catch (error: unknown) {
      const uoe = error as UnsupportedOperationError
      expect(uoe.operation).toBe("requestAuth")
      expect(uoe.adapter).toBe("trino")
      expect(uoe.dataSource).toBe(DS)
      expect(uoe.message).not.toContain("my-secret-token")
    }
  })

  it("query() forwards options.impersonateAs when it is a non-empty string", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const ds = new TrinoDataSource(createFakeClient({ queryImpl: queryFn }), DS)

    await ds.query({
      sql: "SELECT 1",
      options: { impersonateAs: "proxy-user" },
    })

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({ impersonateAs: "proxy-user" })
    )
  })

  it("query() omits impersonateAs when absent or empty", async () => {
    const queryFn = vi.fn<QueryFn>(async () => [])
    const ds = new TrinoDataSource(createFakeClient({ queryImpl: queryFn }), DS)

    await ds.query({ sql: "SELECT 1" })
    const args1 = queryFn.mock.calls[0] as unknown as [FakeQueryOpts]
    expect(args1[0].impersonateAs).toBeUndefined()

    queryFn.mockClear()
    await ds.query({ sql: "SELECT 1", options: { impersonateAs: "" } })
    const args2 = queryFn.mock.calls[0] as unknown as [FakeQueryOpts]
    expect(args2[0].impersonateAs).toBeUndefined()
  })

  it("query() wraps TrinoClient errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Internal Server Error", 500)
    const queryFn = vi.fn<QueryFn>(async () => {
      throw clientError
    })
    const ds = new TrinoDataSource(createFakeClient({ queryImpl: queryFn }), DS)

    expect.assertions(4)
    try {
      await ds.query({ sql: "SELECT 1" })
    } catch (error: unknown) {
      const dse = error as DataSourceError
      expect(dse).toBeInstanceOf(QueryExecutionError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(clientError)
    }
  })

  it("query() wraps row-zipper errors as QueryExecutionError directly", async () => {
    const queryFn = vi.fn<QueryFn>(async ({ transform }) => {
      // Mismatched row triggers row-zipper error
      return [transform!([1, 2, 3], [col("a"), col("b")])]
    })
    const ds = new TrinoDataSource(createFakeClient({ queryImpl: queryFn }), DS)

    expect.assertions(5)
    try {
      await ds.query({ sql: "SELECT a, b FROM t" })
    } catch (error: unknown) {
      const qe = error as QueryExecutionError
      expect(qe).toBeInstanceOf(QueryExecutionError)
      expect(qe.adapter).toBe("trino")
      expect(qe.dataSource).toBe(DS)
      expect(qe.cause).toBeInstanceOf(Error)
      expect(isRowZipperError(qe.cause)).toBeFalsy()
    }
  })
})

// 3. Stream contract

describe("Conformance: Stream contract", () => {
  it("stream() yields keyed records across multiple pages", async () => {
    const columns = [col("id"), col("value")]
    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      async function* gen() {
        // Page 1
        yield transform!([1, "a"], columns)
        yield transform!([2, "b"], columns)
        // Page 2
        yield transform!([3, "c"], columns)
      }
      return gen()
    })
    const ds = new TrinoDataSource(
      createFakeClient({ streamImpl: streamFn }),
      DS
    )

    const gen = await ds.stream({ sql: "SELECT id, value FROM t" })
    const results = await collectAll(gen)

    expect(results).toStrictEqual([
      { id: 1, value: "a" },
      { id: 2, value: "b" },
      { id: 3, value: "c" },
    ])
  })

  it("stream() rejects defined requestAuth with UnsupportedOperationError before calling client", async () => {
    const streamFn = vi.fn<StreamFn>()
    const ds = new TrinoDataSource(
      createFakeClient({ streamImpl: streamFn }),
      DS
    )

    await expect(
      ds.stream({
        sql: "SELECT 1",
        requestAuth: { type: "basic", username: "u", password: "secret-pw" },
      })
    ).rejects.toThrow(UnsupportedOperationError)

    expect(streamFn).not.toHaveBeenCalled()
  })

  it("stream() requestAuth rejection does not leak credentials", async () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)

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

  it("stream() forwards options.impersonateAs to the TrinoClient", async () => {
    const streamFn = vi.fn<StreamFn>(async () => emptyGenerator())
    const ds = new TrinoDataSource(
      createFakeClient({ streamImpl: streamFn }),
      DS
    )

    await ds.stream({
      sql: "SELECT 1",
      options: { impersonateAs: "proxy-user" },
    })

    expect(streamFn).toHaveBeenCalledWith(
      expect.objectContaining({ impersonateAs: "proxy-user" })
    )
  })

  it("stream() classifies client error during later page iteration", async () => {
    const columns = [col("id")]
    const laterPageError = new TrinoClientError("Gateway Timeout", 504)

    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      async function* gen() {
        yield transform!([1], columns)
        throw laterPageError
      }
      return gen()
    })
    const ds = new TrinoDataSource(
      createFakeClient({ streamImpl: streamFn }),
      DS
    )
    const gen = await ds.stream({ sql: "SELECT id FROM t" })

    // First row succeeds
    const first = await takeN(gen, 1)
    expect(first).toStrictEqual([{ id: 1 }])

    // Second iteration hits the later-page client error
    expect.assertions(5)
    try {
      await gen.next()
    } catch (error: unknown) {
      const dse = error as DataSourceError
      expect(dse).toBeInstanceOf(DataSourceError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(laterPageError)
    }
  })

  it("stream() detects tagged row-zipper error on later page and produces QueryExecutionError", async () => {
    const columns = [col("id"), col("name")]

    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      async function* gen() {
        yield transform!([1, "alice"], columns)
        // Mismatched row triggers row-zipper error
        yield transform!([2, "bob", "extra"], columns)
      }
      return gen()
    })
    const ds = new TrinoDataSource(
      createFakeClient({ streamImpl: streamFn }),
      DS
    )
    const gen = await ds.stream({ sql: "SELECT id, name FROM t" })

    // First row succeeds
    await takeN(gen, 1)

    // Second iteration triggers row-zipper error
    expect.assertions(5)
    try {
      await gen.next()
    } catch (error: unknown) {
      const qe = error as QueryExecutionError
      expect(qe).toBeInstanceOf(QueryExecutionError)
      expect(qe.adapter).toBe("trino")
      expect(qe.dataSource).toBe(DS)
      expect(qe.cause).toBeInstanceOf(Error)
      expect(isRowZipperError(qe.cause)).toBeFalsy()
    }
  })

  it("stream() classifies initial stream() call error", async () => {
    const clientError = new TrinoClientError("Bad Gateway", 502)
    const streamFn = vi.fn<StreamFn>(async () => {
      throw clientError
    })
    const ds = new TrinoDataSource(
      createFakeClient({ streamImpl: streamFn }),
      DS
    )

    expect.assertions(4)
    try {
      await ds.stream({ sql: "SELECT 1" })
    } catch (error: unknown) {
      const dse = error as DataSourceError
      expect(dse).toBeInstanceOf(DataSourceError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(clientError)
    }
  })
})

// 4. Metadata contract

describe("Conformance: Metadata contract", () => {
  /**
   * Helper to create a fake client that captures SQL and returns
   * rows after running the adapter-supplied transform.
   */
  function createMetadataClient(opts: {
    rawRows?: unknown[][]
    columns?: Column[]
    throwError?: Error
  }): { client: TrinoClient; captured: { sql: string | undefined } } {
    const captured: { sql: string | undefined } = { sql: undefined }

    const queryFn = vi.fn<QueryFn>(async (queryOpts) => {
      captured.sql = queryOpts.sql
      if (opts.throwError) {
        throw opts.throwError
      }
      const rows = opts.rawRows ?? []
      const cols = opts.columns ?? []
      if (queryOpts.transform) {
        return rows.map((row) => queryOpts.transform!(row, cols))
      }
      return rows
    })

    const client = {
      query: queryFn,
      stream: vi.fn<StreamFn>(async () => emptyGenerator()),
      cancelAllQueries: vi.fn<() => Promise<void>>(async () => {}),
      host: "localhost",
      port: 8080,
      headers: new Headers(),
    } as unknown as TrinoClient

    return { client, captured }
  }

  // ── catalogs() ──────────────────────────────────────────────────────

  it("catalogs() executes SHOW CATALOGS and returns flat string array", async () => {
    const { client, captured } = createMetadataClient({
      rawRows: [["iceberg"], ["hive"]],
      columns: [col("Catalog")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.catalogs()

    expect(captured.sql).toBe("SHOW CATALOGS")
    expect(result).toStrictEqual(["iceberg", "hive"])
  })

  // ── schemas() ───────────────────────────────────────────────────────

  it("schemas() renders SHOW SCHEMAS FROM with quoted catalog", async () => {
    const { client, captured } = createMetadataClient({
      rawRows: [["public"], ["information_schema"]],
      columns: [col("Schema")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.schemas("my_catalog")

    expect(captured.sql).toBe('SHOW SCHEMAS FROM "my_catalog"')
    expect(result).toStrictEqual(["public", "information_schema"])
  })

  it("schemas() escapes embedded double-quote in catalog", async () => {
    const { client, captured } = createMetadataClient({
      rawRows: [],
      columns: [col("Schema")],
    })
    const ds = new TrinoDataSource(client, DS)

    await ds.schemas('cat"x')

    expect(captured.sql).toBe('SHOW SCHEMAS FROM "cat""x"')
  })

  // ── tables() ────────────────────────────────────────────────────────

  it("tables() renders info-schema query with BASE TABLE predicate", async () => {
    const { client, captured } = createMetadataClient({
      rawRows: [["orders"]],
      columns: [col("table_name")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.tables("catalog", "public")

    expect(captured.sql).toBe(
      `SELECT table_name FROM "catalog".information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    )
    expect(result).toStrictEqual(["orders"])
  })

  it("tables() escapes embedded single-quote in schema", async () => {
    const { client, captured } = createMetadataClient({
      rawRows: [],
      columns: [col("table_name")],
    })
    const ds = new TrinoDataSource(client, DS)

    await ds.tables("catalog", "it's")

    expect(captured.sql).toContain("'it''s'")
  })

  // ── views() ─────────────────────────────────────────────────────────

  it("views() renders info-schema query with VIEW predicate", async () => {
    const { client, captured } = createMetadataClient({
      rawRows: [["summary_view"]],
      columns: [col("table_name")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.views("catalog", "public")

    expect(captured.sql).toBe(
      `SELECT table_name FROM "catalog".information_schema.tables WHERE table_schema = 'public' AND table_type = 'VIEW'`
    )
    expect(result).toStrictEqual(["summary_view"])
  })

  // ── columns() ───────────────────────────────────────────────────────

  it("columns() renders SHOW COLUMNS FROM with fully-qualified identifier", async () => {
    const { client, captured } = createMetadataClient({
      rawRows: [
        ["id", "integer", "", "Primary key"],
        ["name", "varchar", "", "User name"],
      ],
      columns: [col("Column"), col("Type"), col("Extra"), col("Comment")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.columns("catalog", "public", "users")

    expect(captured.sql).toBe('SHOW COLUMNS FROM "catalog"."public"."users"')
    expect(result).toStrictEqual([
      { name: "id", type: "integer", extra: "", description: "Primary key" },
      { name: "name", type: "varchar", extra: "", description: "User name" },
    ])
  })

  it("columns() maps Trino comment column to ColumnInfo description", async () => {
    const { client } = createMetadataClient({
      rawRows: [["status", "boolean", "partition key", "Is active"]],
      columns: [col("Column"), col("Type"), col("Extra"), col("Comment")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.columns("c", "s", "t")

    expect(result[0]!.description).toBe("Is active")
  })

  // ── All metadata methods delegate through TrinoClient.query() ───────

  it("all metadata methods delegate through TrinoClient.query()", async () => {
    const { client } = createMetadataClient({
      rawRows: [],
      columns: [col("v")],
    })
    const ds = new TrinoDataSource(client, DS)

    await ds.catalogs()
    expect(client.query).toHaveBeenCalledOnce()

    vi.mocked(client.query).mockClear()
    await ds.schemas("c")
    expect(client.query).toHaveBeenCalledOnce()

    vi.mocked(client.query).mockClear()
    await ds.tables("c", "s")
    expect(client.query).toHaveBeenCalledOnce()

    vi.mocked(client.query).mockClear()
    await ds.views("c", "s")
    expect(client.query).toHaveBeenCalledOnce()

    vi.mocked(client.query).mockClear()
    await ds.columns("c", "s", "t")
    expect(client.query).toHaveBeenCalledOnce()
  })

  // ── Metadata wraps errors through classifyTrinoError ────────────────

  it("metadata methods wrap client errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Service Unavailable", 503)
    const { client } = createMetadataClient({ throwError: clientError })
    const ds = new TrinoDataSource(client, DS)

    const methods: (() => Promise<unknown>)[] = [
      () => ds.catalogs(),
      () => ds.schemas("c"),
      () => ds.tables("c", "s"),
      () => ds.views("c", "s"),
      () => ds.columns("c", "s", "t"),
    ]

    for (const method of methods) {
      try {
        await method()
        expect.unreachable("should have thrown")
      } catch (error: unknown) {
        const dse = error as DataSourceError
        expect(dse).toBeInstanceOf(DataSourceError)
        expect(dse.adapter).toBe("trino")
        expect(dse.dataSource).toBe(DS)
        expect(dse.cause).toBe(clientError)
      }
    }
  })
})

// 5. DDL contract

describe("Conformance: DDL contract", () => {
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

  // ── createTable() ───────────────────────────────────────────────────

  it("createTable() renders CREATE TABLE with quoted identifiers and canonical types", async () => {
    const { client, captured } = createCapturingClient()
    const ds = new TrinoDataSource(client, DS)

    await ds.createTable({
      catalog: "catalog",
      schema: "schema",
      table: "users",
      columns: [
        { name: "id", type: "BIGINT" },
        { name: "name", type: "varchar(255)" },
      ],
    })

    expect(captured.sql).toBe(
      'CREATE TABLE "catalog"."schema"."users" ("id" BIGINT, "name" VARCHAR(255))'
    )
  })

  it("createTable() does not render IF NOT EXISTS", async () => {
    const { client, captured } = createCapturingClient()
    const ds = new TrinoDataSource(client, DS)

    await ds.createTable({
      catalog: "c",
      schema: "s",
      table: "t",
      columns: [{ name: "a", type: "INTEGER" }],
    })

    expect(captured.sql).not.toContain("IF NOT EXISTS")
  })

  it("createTable() rejects zero columns", async () => {
    const { client } = createCapturingClient()
    const ds = new TrinoDataSource(client, DS)

    await expect(
      ds.createTable({ catalog: "c", schema: "s", table: "t", columns: [] })
    ).rejects.toThrow(/at least one column/u)

    expect(client.query).not.toHaveBeenCalled()
  })

  it("createTable() rejects duplicate column names", async () => {
    const { client } = createCapturingClient()
    const ds = new TrinoDataSource(client, DS)

    await expect(
      ds.createTable({
        catalog: "c",
        schema: "s",
        table: "t",
        columns: [
          { name: "id", type: "INTEGER" },
          { name: "id", type: "BIGINT" },
        ],
      })
    ).rejects.toThrow(/duplicate column name/u)

    expect(client.query).not.toHaveBeenCalled()
  })

  it("createTable() rejects unsupported column types", async () => {
    const { client } = createCapturingClient()
    const ds = new TrinoDataSource(client, DS)

    await expect(
      ds.createTable({
        catalog: "c",
        schema: "s",
        table: "t",
        columns: [{ name: "data", type: "ARRAY(VARCHAR)" }],
      })
    ).rejects.toThrow()

    expect(client.query).not.toHaveBeenCalled()
  })

  it("createTable() rejects identifier segments with control characters", async () => {
    const { client } = createCapturingClient()
    const ds = new TrinoDataSource(client, DS)

    await expect(
      ds.createTable({
        catalog: "cat\u0000",
        schema: "s",
        table: "t",
        columns: [{ name: "id", type: "INTEGER" }],
      })
    ).rejects.toThrow()

    expect(client.query).not.toHaveBeenCalled()
  })

  it("createTable() wraps client errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Internal Server Error", 500)
    const client = {
      query: vi.fn(async () => {
        throw clientError
      }),
      stream: vi.fn(),
      cancelAllQueries: vi.fn(async () => {}),
      host: "localhost",
      port: 8080,
      headers: new Headers(),
    } as unknown as TrinoClient
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(4)
    try {
      await ds.createTable({
        catalog: "c",
        schema: "s",
        table: "t",
        columns: [{ name: "id", type: "INTEGER" }],
      })
    } catch (error: unknown) {
      const dse = error as DataSourceError
      expect(dse).toBeInstanceOf(QueryExecutionError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(clientError)
    }
  })

  // ── dropTable() ─────────────────────────────────────────────────────

  it("dropTable() renders DROP TABLE IF EXISTS with quoted identifiers", async () => {
    const { client, captured } = createCapturingClient()
    const ds = new TrinoDataSource(client, DS)

    await ds.dropTable("catalog", "schema", "table")

    expect(captured.sql).toBe('DROP TABLE IF EXISTS "catalog"."schema"."table"')
  })

  it("dropTable() escapes embedded double-quotes in identifiers", async () => {
    const { client, captured } = createCapturingClient()
    const ds = new TrinoDataSource(client, DS)

    await ds.dropTable('cat"a', 'sch"b', 'tbl"c')

    expect(captured.sql).toBe('DROP TABLE IF EXISTS "cat""a"."sch""b"."tbl""c"')
  })

  it("dropTable() rejects empty segments", async () => {
    const { client } = createCapturingClient()
    const ds = new TrinoDataSource(client, DS)

    await expect(ds.dropTable("", "sch", "tbl")).rejects.toThrow()
    expect(client.query).not.toHaveBeenCalled()
  })

  it("dropTable() wraps client errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Service Unavailable", 503)
    const client = {
      query: vi.fn(async () => {
        throw clientError
      }),
      stream: vi.fn(),
      cancelAllQueries: vi.fn(async () => {}),
      host: "localhost",
      port: 8080,
      headers: new Headers(),
    } as unknown as TrinoClient
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(4)
    try {
      await ds.dropTable("c", "s", "t")
    } catch (error: unknown) {
      const dse = error as DataSourceError
      expect(dse).toBeInstanceOf(QueryExecutionError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(clientError)
    }
  })

  // ── qualifiedTableName() ────────────────────────────────────────────

  it("qualifiedTableName() produces properly quoted three-part identifier", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)

    const result = ds.qualifiedTableName({
      dataSource: DS,
      adapter: "trino",
      catalog: "catalog",
      schema: "schema",
      tableName: "table",
    })

    expect(result).toBe('"catalog"."schema"."table"')
  })

  it("qualifiedTableName() escapes embedded double-quotes by doubling", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)

    const result = ds.qualifiedTableName({
      dataSource: DS,
      adapter: "trino",
      catalog: 'cat"a',
      schema: 'sch"b',
      tableName: 'tbl"c',
    })

    expect(result).toBe('"cat""a"."sch""b"."tbl""c"')
  })

  it("qualifiedTableName() preserves dots within a segment", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)

    const result = ds.qualifiedTableName({
      dataSource: DS,
      adapter: "trino",
      catalog: "cat.with.dot",
      schema: "sch",
      tableName: "tbl",
    })

    expect(result).toBe('"cat.with.dot"."sch"."tbl"')
  })

  it("qualifiedTableName() throws for empty segments", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)

    expect(() =>
      ds.qualifiedTableName({
        dataSource: DS,
        adapter: "trino",
        catalog: "",
        schema: "s",
        tableName: "t",
      })
    ).toThrow()

    expect(() =>
      ds.qualifiedTableName({
        dataSource: DS,
        adapter: "trino",
        catalog: "c",
        schema: "",
        tableName: "t",
      })
    ).toThrow()

    expect(() =>
      ds.qualifiedTableName({
        dataSource: DS,
        adapter: "trino",
        catalog: "c",
        schema: "s",
        tableName: "",
      })
    ).toThrow()
  })

  it("qualifiedTableName() throws for segments with control characters", () => {
    const ds = new TrinoDataSource(createFakeClient(), DS)

    expect(() =>
      ds.qualifiedTableName({
        dataSource: DS,
        adapter: "trino",
        catalog: "cat\u0000",
        schema: "s",
        tableName: "t",
      })
    ).toThrow()

    expect(() =>
      ds.qualifiedTableName({
        dataSource: DS,
        adapter: "trino",
        catalog: "c",
        schema: "sch\u001F",
        tableName: "t",
      })
    ).toThrow()
  })
})

// 6. Lifecycle contract

describe("Conformance: Lifecycle contract", () => {
  it("close() delegates to TrinoClient.cancelAllQueries()", async () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    await ds.close()

    expect(client.cancelAllQueries).toHaveBeenCalledOnce()
  })

  it("close() is idempotent — second call does not invoke cancelAllQueries again", async () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    await ds.close()
    await ds.close()

    expect(client.cancelAllQueries).toHaveBeenCalledOnce()
  })

  it("close() resolves without error even if cancelAllQueries throws", async () => {
    const client = createFakeClient()
    ;(
      client.cancelAllQueries as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("cancel failed"))
    const ds = new TrinoDataSource(client, DS)

    await expect(ds.close()).resolves.toBeUndefined()
  })

  it("multiple close() calls after a failed cancelAllQueries are all safe", async () => {
    const client = createFakeClient()
    ;(
      client.cancelAllQueries as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("cancel failed"))
    const ds = new TrinoDataSource(client, DS)

    await ds.close()
    await ds.close()
    await ds.close()

    // cancelAllQueries was only attempted once
    expect(client.cancelAllQueries).toHaveBeenCalledOnce()
  })

  it("close() resolves with undefined (not null or an error)", async () => {
    const client = createFakeClient()
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.close()

    expect(result).toBeUndefined()
  })
})

// 7. Error classification at adapter boundary

describe("Conformance: Error classification at boundary", () => {
  /**
   * Helper: call query() with an error-throwing client and return the
   * caught DataSourceError.
   */
  async function queryWithError(throwError: unknown): Promise<DataSourceError> {
    const queryFn = vi.fn<QueryFn>(async () => {
      throw throwError
    })
    const ds = new TrinoDataSource(createFakeClient({ queryImpl: queryFn }), DS)

    try {
      await ds.query({ sql: "SELECT 1" })
      throw new Error("expected to throw")
    } catch (error: unknown) {
      return error as DataSourceError
    }
  }

  it("TrinoQueryError → QueryExecutionError with diagnostic detail", async () => {
    const original = new TrinoQueryError(
      "Table not found",
      "query-123",
      1,
      "TABLE_NOT_FOUND",
      "USER_ERROR"
    )
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(QueryExecutionError)
    expect(result.message).toContain("TABLE_NOT_FOUND")
    expect(result.message).toContain("USER_ERROR")
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  it("TrinoClientError 401 → AuthenticationError", async () => {
    const original = new TrinoClientError("Unauthorized", 401)
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(AuthenticationError)
    expect(result.message).toContain("401")
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  it("TrinoClientError 403 → AuthenticationError", async () => {
    const original = new TrinoClientError("Forbidden", 403)
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(AuthenticationError)
    expect(result.message).toContain("403")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  it("TrinoClientError 408 → TimeoutError", async () => {
    const original = new TrinoClientError("Request Timeout", 408)
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(TimeoutError)
    expect(result.message).toContain("408")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  it("TrinoClientError 504 → TimeoutError", async () => {
    const original = new TrinoClientError("Gateway Timeout", 504)
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(TimeoutError)
    expect(result.message).toContain("504")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  it("TrinoClientError undefined status → NetworkError", async () => {
    const original = new TrinoClientError("Connection refused")
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(NetworkError)
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  it("TrinoClientError 500 → QueryExecutionError with HTTP status in message", async () => {
    const original = new TrinoClientError("Internal Server Error", 500)
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(QueryExecutionError)
    expect(result.message).toContain("500")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  it("TrinoTimeoutError → TimeoutError", async () => {
    const original = new TrinoTimeoutError("Query timed out", "query-456")
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(TimeoutError)
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  it("TrinoCancellationError → CancellationError", async () => {
    const original = new TrinoCancellationError("Query cancelled", "query-789")
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(CancellationError)
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  it("DOMException TimeoutError → TimeoutError", async () => {
    const original = new DOMException("Timed out", "TimeoutError")
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(TimeoutError)
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  it("DOMException AbortError → CancellationError", async () => {
    const original = new DOMException("Aborted", "AbortError")
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(CancellationError)
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  it("TypeError → NetworkError", async () => {
    const original = new TypeError("fetch failed")
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(NetworkError)
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  it("generic Error → QueryExecutionError with unknown indication", async () => {
    const original = new Error("something unexpected")
    const result = await queryWithError(original)

    expect(result).toBeInstanceOf(QueryExecutionError)
    expect(result.message).toContain("unknown")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  it("already-classified DataSourceError is passed through with reference identity", async () => {
    const existing = new QueryExecutionError("already classified", "trino", DS)
    const queryFn = vi.fn<QueryFn>(async () => {
      throw existing
    })
    const ds = new TrinoDataSource(createFakeClient({ queryImpl: queryFn }), DS)

    expect.assertions(1)
    try {
      await ds.query({ sql: "SELECT 1" })
    } catch (error: unknown) {
      expect(error).toBe(existing)
    }
  })

  it("error classification never includes credentials in messages", async () => {
    const sensitiveStrings = [
      "password123",
      "Bearer eyJ0b2tlbg",
      "Authorization: Basic",
    ]

    const errors: unknown[] = [
      new TrinoQueryError("fail", "q1", 1, "GENERIC_ERROR", "USER_ERROR"),
      new TrinoClientError("fail", 401),
      new TrinoClientError("fail", 500),
      new TrinoTimeoutError("fail"),
      new TrinoCancellationError("fail"),
      new TypeError("fail"),
      new Error("fail"),
    ]

    for (const err of errors) {
      const result = await queryWithError(err)
      for (const secret of sensitiveStrings) {
        expect(result.message).not.toContain(secret)
      }
    }
  })

  // ── stream() boundary error classification ──────────────────────────

  it("stream() classifies TrinoClientError 401 on later page as AuthenticationError", async () => {
    const columns = [col("id")]
    const authError = new TrinoClientError("Unauthorized", 401)

    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      async function* gen() {
        yield transform!([1], columns)
        throw authError
      }
      return gen()
    })
    const ds = new TrinoDataSource(
      createFakeClient({ streamImpl: streamFn }),
      DS
    )
    const gen = await ds.stream({ sql: "SELECT id FROM t" })

    await takeN(gen, 1)

    expect.assertions(4)
    try {
      await gen.next()
    } catch (error: unknown) {
      const dse = error as DataSourceError
      expect(dse).toBeInstanceOf(AuthenticationError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(authError)
    }
  })

  it("stream() classifies TypeError on later page as NetworkError", async () => {
    const columns = [col("id")]
    const typeError = new TypeError("fetch failed")

    const streamFn = vi.fn<StreamFn>(async ({ transform }) => {
      async function* gen() {
        yield transform!([1], columns)
        throw typeError
      }
      return gen()
    })
    const ds = new TrinoDataSource(
      createFakeClient({ streamImpl: streamFn }),
      DS
    )
    const gen = await ds.stream({ sql: "SELECT id FROM t" })

    await takeN(gen, 1)

    expect.assertions(4)
    try {
      await gen.next()
    } catch (error: unknown) {
      const dse = error as DataSourceError
      expect(dse).toBeInstanceOf(NetworkError)
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(typeError)
    }
  })
})
