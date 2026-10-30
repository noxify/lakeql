import type { AdapterName, SourceConfig } from "@lakeql/datasource"
import type {
  DatabaseIntrospector,
  DialectAdapter,
  Kysely,
  QueryCompiler,
  RawBuilder,
} from "kysely"

/**
 * Engine-specific SQL generation strategy for Kysely.
 *
 * Each adapter provides a dialect that handles identifier quoting,
 * pagination syntax, date functions, and sql-formatter language selection.
 * The dialect is injected into the query builder — the query builder
 * itself contains no adapter-specific SQL logic.
 */
export interface QueryDialect {
  /** Open adapter name identifying the backend this dialect targets. */
  readonly adapterName: AdapterName
  /** Creates the Kysely dialect adapter (e.g. PostgresAdapter, MssqlAdapter). */
  createAdapter: () => DialectAdapter
  /** Creates the Kysely query compiler for the target backend. */
  createQueryCompiler: () => QueryCompiler
  /** Creates the Kysely database introspector for the target backend. */
  createIntrospector: (db: Kysely<unknown>) => DatabaseIntrospector
  /** Wraps a column name in the backend-specific timestamp-to-unix conversion function. */
  toUnixTimestamp: (field: string) => RawBuilder<unknown>
  /** Returns a raw SQL fragment for limit/offset pagination. */
  pagination: (limit: number, offset?: number) => RawBuilder<unknown>
  /**
   * Backend-specific boolean "true" literal used for the record-present
   * sentinel column in the `records` CTE. Trino uses `TRUE`; T-SQL backends
   * (e.g. Fabric) have no boolean literal and use `1`.
   */
  trueLiteral: () => RawBuilder<unknown>
  /** Returns the fully-qualified table name with backend-specific quoting. */
  qualifiedTable: (config: SourceConfig) => string
}
