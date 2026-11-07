import {
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
} from "kysely"

import type { QueryDialect } from "../src"

/**
 * A Trino-compatible test dialect for query-builder tests.
 *
 * Uses the Postgres Kysely components (same as the real Trino adapter)
 * to verify that the query builder generates correct SQL when given
 * a Postgres-style dialect. This avoids a dependency on @lakeql/adapter-trino.
 */
export const testTrinoDialect: QueryDialect = {
  adapterName: "trino",
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
    `"${config.catalog}"."${config.schema}"."${config.tableName}"`,
}
