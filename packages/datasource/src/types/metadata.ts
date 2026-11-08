import type { DataSourceAuth } from "./auth"

/**
 * Parameters for executing a SQL query against a data source.
 */
export interface QueryProps {
  /** SQL statement to execute. */
  sql: string
  /** Optional cancellation signal for the query. */
  signal?: AbortSignal
  /** Credentials resolved for this request. */
  requestAuth?: DataSourceAuth
  /** Adapter-specific query options. */
  options?: Record<string, unknown>
}

/**
 * Metadata describing a single column in a table.
 */
export interface ColumnInfo {
  /** Column name as exposed by the data source. */
  name: string
  /** Native or normalized data type name. */
  type: string
  /** Additional adapter-provided metadata, such as precision or nullability. */
  extra?: string
  /** Optional human-readable column description. */
  description?: string
}

/**
 * Definition for creating a new table.
 */
export interface TableDefinition {
  /** Catalog in which to create the table. */
  catalog: string
  /** Schema in which to create the table. */
  schema: string
  /** Name of the table to create. */
  table: string
  /** Ordered column definitions for the new table. */
  columns: { name: string; type: string }[]
}
