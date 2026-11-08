/**
 * Fabric-specific {@link QueryDialect} implementation using Kysely components.
 *
 * Provides T-SQL–specific SQL generation hooks: MSSQL-compatible Kysely
 * components for query compilation, `DATEDIFF(SECOND, ...)` for date
 * conversion, `OFFSET/FETCH` for pagination, and bracket-quoted
 * identifier quoting.
 *
 * @module
 */

import type { QueryDialect } from "@lakeql/query-builder"
import {
  MssqlAdapter,
  MssqlIntrospector,
  MssqlQueryCompiler,
  sql,
} from "kysely"

import { ADAPTER_NAME } from "./constants"
import { quoteQualifiedIdentifier } from "./sql-helpers"

/**
 * Fabric query dialect implementing the neutral {@link QueryDialect} contract.
 *
 * Uses Kysely's MSSQL adapter/compiler since Fabric's SQL dialect is
 * T-SQL. The dialect provides Fabric-specific SQL fragments for
 * timestamp conversion, pagination, and identifier quoting.
 */
export const fabricDialect: QueryDialect = {
  adapterName: ADAPTER_NAME,
  createAdapter: () => new MssqlAdapter(),
  createQueryCompiler: () => new MssqlQueryCompiler(),
  createIntrospector: (db) => new MssqlIntrospector(db),
  toUnixTimestamp: (field) =>
    sql.raw(`DATEDIFF(SECOND, '1970-01-01', ${field})`),
  pagination: (limit, offset) =>
    sql.raw(`OFFSET ${offset ?? 0} ROWS FETCH NEXT ${limit} ROWS ONLY`),
  // T-SQL has no boolean literal; use 1 for the record-present sentinel.
  trueLiteral: () => sql.raw("1"),
  qualifiedTable: (config) =>
    quoteQualifiedIdentifier(config.catalog, config.schema, config.tableName),
}
