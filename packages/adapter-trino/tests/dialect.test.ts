/**
 * Tests for the Trino Kysely-based query dialect.
 *
 * Since SQL generation is now handled by the shared `@lakeql/query-builder`
 * (which has its own comprehensive test suite), these tests focus on verifying
 * that the dialect correctly provides Trino-specific components:
 *
 * - Kysely adapter/compiler/introspector selection (Postgres-compatible)
 * - Timestamp conversion via `to_unixtime()`
 * - Pagination syntax (`FETCH FIRST/NEXT N ROWS ONLY`)
 * - Identifier quoting (double-quoted, via `quoteQualifiedIdentifier`)
 * - Correct adapter name and formatter language
 */

import type { SourceConfig } from "@lakeql/datasource"
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely"
import { describe, expect, it } from "vitest"

import { ADAPTER_NAME } from "../src/constants"
import { trinoDialect } from "../src/dialect"

describe("Trino Kysely dialect", () => {
  it("adapterName is the Trino adapter constant", () => {
    expect(trinoDialect.adapterName).toBe(ADAPTER_NAME)
    expect(trinoDialect.adapterName).toBe("trino")
  })

  it("createAdapter returns a PostgresAdapter", () => {
    const adapter = trinoDialect.createAdapter()
    expect(adapter).toBeInstanceOf(PostgresAdapter)
  })

  it("createQueryCompiler returns a PostgresQueryCompiler", () => {
    const compiler = trinoDialect.createQueryCompiler()
    expect(compiler).toBeInstanceOf(PostgresQueryCompiler)
  })

  it("createIntrospector returns a PostgresIntrospector", () => {
    const db = new Kysely<unknown>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (d) => new PostgresIntrospector(d),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    })
    const introspector = trinoDialect.createIntrospector(db)
    expect(introspector).toBeInstanceOf(PostgresIntrospector)
  })

  describe("toUnixTimestamp", () => {
    it("wraps field in to_unixtime()", () => {
      const builder = trinoDialect.toUnixTimestamp("created_at")
      // Compile the raw builder to verify the SQL fragment
      const db = new Kysely<{ t: { id: number } }>({
        dialect: {
          createAdapter: () => trinoDialect.createAdapter(),
          createDriver: () => new DummyDriver(),
          createIntrospector: (d) => trinoDialect.createIntrospector(d),
          createQueryCompiler: () => trinoDialect.createQueryCompiler(),
        },
      })
      const query = db.selectFrom("t").select(builder.as("ts")).compile()
      expect(query.sql).toContain("to_unixtime(created_at)")
    })
  })

  describe("pagination", () => {
    it("without offset uses FETCH FIRST N ROWS ONLY", () => {
      const db = new Kysely<{ t: { id: number } }>({
        dialect: {
          createAdapter: () => trinoDialect.createAdapter(),
          createDriver: () => new DummyDriver(),
          createIntrospector: (d) => trinoDialect.createIntrospector(d),
          createQueryCompiler: () => trinoDialect.createQueryCompiler(),
        },
      })
      const query = db
        .selectFrom("t")
        .selectAll()
        .modifyEnd(trinoDialect.pagination(100))
        .compile()
      expect(query.sql).toContain("FETCH FIRST 100 ROWS ONLY")
    })

    it("with offset uses FETCH NEXT N ROWS ONLY", () => {
      const db = new Kysely<{ t: { id: number } }>({
        dialect: {
          createAdapter: () => trinoDialect.createAdapter(),
          createDriver: () => new DummyDriver(),
          createIntrospector: (d) => trinoDialect.createIntrospector(d),
          createQueryCompiler: () => trinoDialect.createQueryCompiler(),
        },
      })
      const query = db
        .selectFrom("t")
        .selectAll()
        .modifyEnd(trinoDialect.pagination(50, 100))
        .compile()
      expect(query.sql).toContain("FETCH NEXT 50 ROWS ONLY")
    })

    it("with zero offset uses FETCH FIRST N ROWS ONLY", () => {
      const db = new Kysely<{ t: { id: number } }>({
        dialect: {
          createAdapter: () => trinoDialect.createAdapter(),
          createDriver: () => new DummyDriver(),
          createIntrospector: (d) => trinoDialect.createIntrospector(d),
          createQueryCompiler: () => trinoDialect.createQueryCompiler(),
        },
      })
      const query = db
        .selectFrom("t")
        .selectAll()
        .modifyEnd(trinoDialect.pagination(100, 0))
        .compile()
      expect(query.sql).toContain("FETCH FIRST 100 ROWS ONLY")
    })
  })

  describe("qualifiedTable", () => {
    it("quotes catalog, schema, and table with double quotes", () => {
      const config: SourceConfig = {
        dataSource: "warehouse",
        adapter: "trino",
        catalog: "iceberg",
        schema: "public",
        tableName: "orders",
      }
      expect(trinoDialect.qualifiedTable(config)).toBe(
        '"iceberg"."public"."orders"'
      )
    })

    it("escapes double quotes in identifiers", () => {
      const config: SourceConfig = {
        dataSource: "warehouse",
        adapter: "trino",
        catalog: 'my"catalog',
        schema: "public",
        tableName: "orders",
      }
      expect(trinoDialect.qualifiedTable(config)).toBe(
        '"my""catalog"."public"."orders"'
      )
    })

    it("rejects empty identifier segments", () => {
      const config: SourceConfig = {
        dataSource: "warehouse",
        adapter: "trino",
        catalog: "",
        schema: "public",
        tableName: "orders",
      }
      expect(() => trinoDialect.qualifiedTable(config)).toThrow(
        "Identifier segment must not be empty"
      )
    })
  })
})
