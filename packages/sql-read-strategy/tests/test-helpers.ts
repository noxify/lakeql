import type { AdapterName } from "@lakeql/datasource"
import type { QueryDialect } from "@lakeql/query-builder"
import {
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
} from "kysely"

/**
 * Creates a mock {@link QueryDialect} with the given adapter name.
 *
 * Uses Postgres Kysely components as dummy implementations. The dialect
 * is structurally valid for `generateQuery()` but the SQL it produces is
 * only suitable for lightweight tests that do not inspect the actual
 * SQL output.
 */
export function createMockDialect(adapterName: AdapterName): QueryDialect {
  return {
    adapterName,
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
}
