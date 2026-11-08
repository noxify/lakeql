/**
 * Trino-specific {@link QueryDialect} implementation using Kysely components.
 *
 * Provides Trino-specific SQL generation hooks: Postgres-compatible Kysely
 * components for query compilation, `to_unixtime()` for date conversion,
 * `FETCH FIRST/NEXT N ROWS ONLY` for pagination, and double-quoted
 * identifier quoting.
 *
 * @module
 */

import type { QueryDialect } from "@lakeql/query-builder"
import {
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
} from "kysely"

import { ADAPTER_NAME } from "./constants"
import { quoteQualifiedIdentifier } from "./sql-helpers"

/**
 * Trino query dialect implementing the neutral {@link QueryDialect} contract.
 *
 * Uses Kysely's Postgres adapter/compiler since Trino's SQL dialect is
 * Postgres-compatible for query compilation purposes. The dialect provides
 * Trino-specific SQL fragments for timestamp conversion, pagination, and
 * identifier quoting.
 */
export const trinoDialect: QueryDialect = {
  adapterName: ADAPTER_NAME,
  createAdapter: () => new PostgresAdapter(),
  createQueryCompiler: () => new PostgresQueryCompiler(),
  createIntrospector: (db) => new PostgresIntrospector(db),
  toUnixTimestamp: (field) => sql.raw(`to_unixtime(${field})`),
  pagination: (limit, offset) =>
    offset && offset > 0
      ? sql.raw(`FETCH NEXT ${limit} ROWS ONLY`)
      : sql.raw(`FETCH FIRST ${limit} ROWS ONLY`),
  trueLiteral: () => sql.raw("TRUE"),
  qualifiedTable: (config) =>
    quoteQualifiedIdentifier(config.catalog, config.schema, config.tableName),
}
