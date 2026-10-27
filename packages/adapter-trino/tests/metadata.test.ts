// oxlint-disable vitest/max-expects
// oxlint-disable import/no-named-as-default-member
// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable typescript/consistent-type-imports
// oxlint-disable eslint/no-control-regex
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable unicorn/consistent-function-scoping

import { QueryExecutionError } from "@lakeql/datasource"
import type { Column, TrinoClient } from "@lakeql/trino-client"
import { TrinoClientError } from "@lakeql/trino-client"
import fc from "fast-check"
import { describe, expect, vi, it } from "vitest"

import { TrinoDataSource } from "../src/adapter"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DS = "metadata-test-ds"

function col(name: string, type = "varchar"): Column {
  return { name, type }
}

/**
 * Captured SQL from the most recent `query()` call on the fake client.
 * The fake client records it and returns the configured mock rows after
 * running the adapter-supplied transform on the raw positional data.
 */
interface FakeQueryCall {
  sql: string
  transform?: (row: unknown[], columns: Column[]) => unknown
}

/**
 * Create a fake TrinoClient that:
 * 1. Captures the SQL from each `query()` call.
 * 2. Applies the adapter-supplied `transform` to `rawRows` using `columns`.
 * 3. Returns the transformed rows.
 *
 * For error tests, pass `throwError` to make `query()` reject.
 */
function createFakeClient(opts: {
  rawRows?: unknown[][]
  columns?: Column[]
  throwError?: Error
}): { client: TrinoClient; calls: FakeQueryCall[] } {
  const calls: FakeQueryCall[] = []

  const queryFn = vi.fn<(queryOpts: FakeQueryCall) => Promise<unknown[]>>(
    async (queryOpts: FakeQueryCall) => {
      calls.push(queryOpts)

      if (opts.throwError) {
        throw opts.throwError
      }

      const rows = opts.rawRows ?? []
      const cols = opts.columns ?? []
      if (queryOpts.transform) {
        return rows.map((row) => queryOpts.transform!(row, cols))
      }
      return rows
    }
  )

  const client = {
    query: queryFn,
    stream: vi.fn<() => Promise<AsyncGenerator<unknown>>>(async () => {
      async function* empty(): AsyncGenerator<unknown> {
        /* no-op */
      }
      return empty()
    }),
    cancelAllQueries: vi.fn<() => Promise<void>>(async () => {}),
    host: "localhost",
    port: 8080,
    headers: new Headers(),
  } as unknown as TrinoClient

  return { client, calls }
}

// catalogs()

describe("TrinoDataSource.catalogs()", () => {
  it("executes SHOW CATALOGS and returns a flat string array", async () => {
    const { client, calls } = createFakeClient({
      rawRows: [["iceberg"], ["hive"], ["system"]],
      columns: [col("Catalog")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.catalogs()

    expect(calls).toHaveLength(1)
    expect(calls[0]!.sql).toBe("SHOW CATALOGS")
    expect(result).toStrictEqual(["iceberg", "hive", "system"])
  })

  it("returns an empty array when no catalogs exist", async () => {
    const { client } = createFakeClient({
      rawRows: [],
      columns: [col("Catalog")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.catalogs()

    expect(result).toStrictEqual([])
  })

  it("wraps client errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Service Unavailable", 503)
    const { client } = createFakeClient({ throwError: clientError })
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(4)
    try {
      await ds.catalogs()
    } catch (error: unknown) {
      const qe = error as QueryExecutionError
      expect(qe).toBeInstanceOf(QueryExecutionError)
      expect(qe.adapter).toBe("trino")
      expect(qe.dataSource).toBe(DS)
      expect(qe.cause).toBe(clientError)
    }
  })
})

// schemas()

describe("TrinoDataSource.schemas()", () => {
  it("renders SHOW SCHEMAS FROM with quoted catalog", async () => {
    const { client, calls } = createFakeClient({
      rawRows: [["public"], ["information_schema"]],
      columns: [col("Schema")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.schemas("my_catalog")

    expect(calls).toHaveLength(1)
    expect(calls[0]!.sql).toBe('SHOW SCHEMAS FROM "my_catalog"')
    expect(result).toStrictEqual(["public", "information_schema"])
  })

  it("escapes embedded double-quote in catalog name", async () => {
    const { client, calls } = createFakeClient({
      rawRows: [["default"]],
      columns: [col("Schema")],
    })
    const ds = new TrinoDataSource(client, DS)

    await ds.schemas('cat"test')

    expect(calls[0]!.sql).toBe('SHOW SCHEMAS FROM "cat""test"')
  })

  it("returns an empty array when no schemas exist", async () => {
    const { client } = createFakeClient({
      rawRows: [],
      columns: [col("Schema")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.schemas("empty_catalog")

    expect(result).toStrictEqual([])
  })

  it("wraps client errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Unauthorized", 401)
    const { client } = createFakeClient({ throwError: clientError })
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(3)
    try {
      await ds.schemas("test")
    } catch (error: unknown) {
      const dse = error as import("@lakeql/datasource").DataSourceError
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(clientError)
    }
  })
})

// tables()

describe("TrinoDataSource.tables()", () => {
  it("renders information_schema query with quoted catalog and escaped schema literal", async () => {
    const { client, calls } = createFakeClient({
      rawRows: [["orders"], ["customers"]],
      columns: [col("table_name")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.tables("my_catalog", "public")

    expect(calls).toHaveLength(1)
    expect(calls[0]!.sql).toBe(
      `SELECT table_name FROM "my_catalog".information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    )
    expect(result).toStrictEqual(["orders", "customers"])
  })

  it("escapes embedded single-quote in schema name", async () => {
    const { client, calls } = createFakeClient({
      rawRows: [["t1"]],
      columns: [col("table_name")],
    })
    const ds = new TrinoDataSource(client, DS)

    await ds.tables("catalog", "sch'test")

    expect(calls[0]!.sql).toBe(
      `SELECT table_name FROM "catalog".information_schema.tables WHERE table_schema = 'sch''test' AND table_type = 'BASE TABLE'`
    )
  })

  it("escapes embedded double-quote in catalog name", async () => {
    const { client, calls } = createFakeClient({
      rawRows: [],
      columns: [col("table_name")],
    })
    const ds = new TrinoDataSource(client, DS)

    await ds.tables('cat"log', "schema")

    expect(calls[0]!.sql).toBe(
      `SELECT table_name FROM "cat""log".information_schema.tables WHERE table_schema = 'schema' AND table_type = 'BASE TABLE'`
    )
  })

  it("returns an empty array when no tables exist", async () => {
    const { client } = createFakeClient({
      rawRows: [],
      columns: [col("table_name")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.tables("catalog", "empty")

    expect(result).toStrictEqual([])
  })

  it("wraps client errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Internal Server Error", 500)
    const { client } = createFakeClient({ throwError: clientError })
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(4)
    try {
      await ds.tables("catalog", "schema")
    } catch (error: unknown) {
      const qe = error as QueryExecutionError
      expect(qe).toBeInstanceOf(QueryExecutionError)
      expect(qe.adapter).toBe("trino")
      expect(qe.dataSource).toBe(DS)
      expect(qe.cause).toBe(clientError)
    }
  })
})

// views()

describe("TrinoDataSource.views()", () => {
  it("renders information_schema query with VIEW predicate", async () => {
    const { client, calls } = createFakeClient({
      rawRows: [["orders_view"], ["summary"]],
      columns: [col("table_name")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.views("my_catalog", "public")

    expect(calls).toHaveLength(1)
    expect(calls[0]!.sql).toBe(
      `SELECT table_name FROM "my_catalog".information_schema.tables WHERE table_schema = 'public' AND table_type = 'VIEW'`
    )
    expect(result).toStrictEqual(["orders_view", "summary"])
  })

  it("escapes embedded single-quote in schema name", async () => {
    const { client, calls } = createFakeClient({
      rawRows: [],
      columns: [col("table_name")],
    })
    const ds = new TrinoDataSource(client, DS)

    await ds.views("catalog", "it's")

    expect(calls[0]!.sql).toBe(
      `SELECT table_name FROM "catalog".information_schema.tables WHERE table_schema = 'it''s' AND table_type = 'VIEW'`
    )
  })

  it("escapes embedded double-quote in catalog name", async () => {
    const { client, calls } = createFakeClient({
      rawRows: [],
      columns: [col("table_name")],
    })
    const ds = new TrinoDataSource(client, DS)

    await ds.views('cat"log', "schema")

    expect(calls[0]!.sql).toBe(
      `SELECT table_name FROM "cat""log".information_schema.tables WHERE table_schema = 'schema' AND table_type = 'VIEW'`
    )
  })

  it("returns an empty array when no views exist", async () => {
    const { client } = createFakeClient({
      rawRows: [],
      columns: [col("table_name")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.views("catalog", "empty")

    expect(result).toStrictEqual([])
  })

  it("wraps client errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Forbidden", 403)
    const { client } = createFakeClient({ throwError: clientError })
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(3)
    try {
      await ds.views("catalog", "schema")
    } catch (error: unknown) {
      const dse = error as import("@lakeql/datasource").DataSourceError
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(clientError)
    }
  })
})

// columns()

describe("TrinoDataSource.columns()", () => {
  it("renders SHOW COLUMNS FROM with fully-qualified quoted identifier", async () => {
    const { client, calls } = createFakeClient({
      rawRows: [
        ["id", "integer", "", "Primary key"],
        ["name", "varchar", "", "User name"],
      ],
      columns: [col("Column"), col("Type"), col("Extra"), col("Comment")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.columns("my_catalog", "public", "users")

    expect(calls).toHaveLength(1)
    expect(calls[0]!.sql).toBe(
      'SHOW COLUMNS FROM "my_catalog"."public"."users"'
    )
    expect(result).toStrictEqual([
      { name: "id", type: "integer", extra: "", description: "Primary key" },
      { name: "name", type: "varchar", extra: "", description: "User name" },
    ])
  })

  it("maps Trino comment column to ColumnInfo description", async () => {
    const { client } = createFakeClient({
      rawRows: [["status", "boolean", "partition key", "Whether active"]],
      columns: [col("Column"), col("Type"), col("Extra"), col("Comment")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.columns("catalog", "schema", "table")

    expect(result).toStrictEqual([
      {
        name: "status",
        type: "boolean",
        extra: "partition key",
        description: "Whether active",
      },
    ])
  })

  it("escapes embedded double-quotes in all identifier segments", async () => {
    const { client, calls } = createFakeClient({
      rawRows: [],
      columns: [col("Column"), col("Type"), col("Extra"), col("Comment")],
    })
    const ds = new TrinoDataSource(client, DS)

    await ds.columns('cat"a', 'sch"b', 'tbl"c')

    expect(calls[0]!.sql).toBe('SHOW COLUMNS FROM "cat""a"."sch""b"."tbl""c"')
  })

  it("returns an empty array when the table has no columns", async () => {
    const { client } = createFakeClient({
      rawRows: [],
      columns: [col("Column"), col("Type"), col("Extra"), col("Comment")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.columns("catalog", "schema", "empty_table")

    expect(result).toStrictEqual([])
  })

  it("wraps client errors through classifyTrinoError", async () => {
    const clientError = new TrinoClientError("Gateway Timeout", 504)
    const { client } = createFakeClient({ throwError: clientError })
    const ds = new TrinoDataSource(client, DS)

    expect.assertions(3)
    try {
      await ds.columns("catalog", "schema", "table")
    } catch (error: unknown) {
      const dse = error as import("@lakeql/datasource").DataSourceError
      expect(dse.adapter).toBe("trino")
      expect(dse.dataSource).toBe(DS)
      expect(dse.cause).toBe(clientError)
    }
  })

  it("handles columns with null comment", async () => {
    // The adapter uses String(row["Comment"]) so null becomes undefined
    const { client } = createFakeClient({
      rawRows: [["col1", "bigint", "", null]],
      columns: [col("Column"), col("Type"), col("Extra"), col("Comment")],
    })
    const ds = new TrinoDataSource(client, DS)

    const result = await ds.columns("catalog", "schema", "table")

    expect(result[0]!.description).toBeUndefined()
  })
})

// Property-based tests (fast-check)

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

/**
 * Generates arbitrary strings that are safe for identifier/literal
 * contexts: non-empty, no C0/C1 control characters.
 */
const arbSafeString = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => !/[\u0000-\u001F\u007F-\u009F]/u.test(s))

/**
 * Generates strings that include double quotes, dots, apostrophes,
 * and unicode to stress identifier quoting and literal escaping.
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
 * Creates a fake TrinoClient that captures the SQL string passed to
 * `query()` and returns an empty result set.
 */
function createPropCapturingClient(): {
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

const PROP_DS = "prop-metadata-ds"

// Adapter-owned metadata SQL safety

describe("Adapter-owned metadata SQL safety", () => {
  /**
   * For any safe string used as a catalog name in `schemas()`, the
   * rendered SQL contains the catalog properly quoted as a
   * double-quoted identifier with embedded quotes doubled.
   */
  it("schemas() renders catalog as a properly quoted identifier", async () => {
    await fc.assert(
      fc.asyncProperty(arbStressIdentifier, async (catalog) => {
        const { client, captured } = createPropCapturingClient()
        const ds = new TrinoDataSource(client, PROP_DS)

        await ds.schemas(catalog)

        expect(captured.sql).toBeDefined()
        const sql = captured.sql as string

        // The catalog must appear as a double-quoted identifier
        const escaped = catalog.replaceAll('"', '""')
        expect(sql).toContain(`"${escaped}"`)

        // Must use SHOW SCHEMAS FROM
        expect(sql).toMatch(/^SHOW SCHEMAS FROM /u)
      }),
      { numRuns: 200 }
    )
  })

  /**
   * For any safe string used as schema in `tables()` and `views()`,
   * the rendered SQL contains the schema properly escaped as a
   * single-quoted literal with embedded quotes doubled.
   */
  it("tables() renders schema as an escaped literal and catalog as a quoted identifier", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbStressIdentifier,
        arbSafeString,
        async (catalog, schema) => {
          const { client, captured } = createPropCapturingClient()
          const ds = new TrinoDataSource(client, PROP_DS)

          await ds.tables(catalog, schema)

          expect(captured.sql).toBeDefined()
          const sql = captured.sql as string

          // Schema appears as an escaped single-quoted literal
          const escapedSchema = schema.replaceAll("'", "''")
          expect(sql).toContain(`'${escapedSchema}'`)

          // Catalog appears as a double-quoted identifier
          const escapedCatalog = catalog.replaceAll('"', '""')
          expect(sql).toContain(`"${escapedCatalog}"`)

          // Fixed BASE TABLE predicate present
          expect(sql).toContain("'BASE TABLE'")
          expect(sql).toContain("information_schema.tables")
        }
      ),
      { numRuns: 200 }
    )
  })

  it("views() renders schema as an escaped literal and catalog as a quoted identifier", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbStressIdentifier,
        arbSafeString,
        async (catalog, schema) => {
          const { client, captured } = createPropCapturingClient()
          const ds = new TrinoDataSource(client, PROP_DS)

          await ds.views(catalog, schema)

          expect(captured.sql).toBeDefined()
          const sql = captured.sql as string

          // Schema appears as an escaped single-quoted literal
          const escapedSchema = schema.replaceAll("'", "''")
          expect(sql).toContain(`'${escapedSchema}'`)

          // Catalog appears as a double-quoted identifier
          const escapedCatalog = catalog.replaceAll('"', '""')
          expect(sql).toContain(`"${escapedCatalog}"`)

          // Fixed VIEW predicate present
          expect(sql).toContain("'VIEW'")
          expect(sql).toContain("information_schema.tables")
        }
      ),
      { numRuns: 200 }
    )
  })

  /**
   * For any safe string triple used in `columns()`, all three segments
   * appear as properly quoted identifiers joined with dots.
   */
  it("columns() renders all three segments as quoted identifiers", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbStressIdentifier,
        arbStressIdentifier,
        arbStressIdentifier,
        async (catalog, schema, table) => {
          const { client, captured } = createPropCapturingClient()
          const ds = new TrinoDataSource(client, PROP_DS)

          await ds.columns(catalog, schema, table)

          expect(captured.sql).toBeDefined()
          const sql = captured.sql as string

          // Each segment must appear as a quoted identifier
          const esc = (s: string) => s.replaceAll('"', '""')
          expect(sql).toContain(
            `"${esc(catalog)}"."${esc(schema)}"."${esc(table)}"`
          )

          // Must use SHOW COLUMNS FROM
          expect(sql).toMatch(/^SHOW COLUMNS FROM /u)
        }
      ),
      { numRuns: 200 }
    )
  })

  /**
   * All metadata methods send SQL through TrinoClient.query() — not
   * through convenience methods. The fake client's query mock must be
   * called exactly once for each operation.
   */
  it("all metadata methods delegate through TrinoClient.query()", async () => {
    await fc.assert(
      fc.asyncProperty(arbSafeString, async (name) => {
        const { client } = createPropCapturingClient()
        const ds = new TrinoDataSource(client, PROP_DS)

        // Each call should invoke client.query exactly once
        await ds.catalogs()
        expect(client.query).toHaveBeenCalledOnce()

        vi.mocked(client.query).mockClear()
        await ds.schemas(name)
        expect(client.query).toHaveBeenCalledOnce()

        vi.mocked(client.query).mockClear()
        await ds.tables(name, name)
        expect(client.query).toHaveBeenCalledOnce()

        vi.mocked(client.query).mockClear()
        await ds.views(name, name)
        expect(client.query).toHaveBeenCalledOnce()

        vi.mocked(client.query).mockClear()
        await ds.columns(name, name, name)
        expect(client.query).toHaveBeenCalledOnce()
      }),
      { numRuns: 50 }
    )
  })
})
