/**
 * Type definitions for the Trino client.
 *
 * Response types adapted from better-trino-client by nickBes (MIT License)
 * https://github.com/nickBes/better-trino-client
 */

import type { RetryConfig } from "./retry"

// ─── Query State ─────────────────────────────────────────────────────────────

export enum State {
  "QUEUED" = "QUEUED",
  "PLANNING" = "PLANNING",
  "STARTING" = "STARTING",
  "RUNNING" = "RUNNING",
  "FINISHED" = "FINISHED",
  "CANCELED" = "CANCELED",
  "FAILED" = "FAILED",
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * Basic authentication using username and password.
 */
export interface BasicAuth {
  type: "basic"
  /** The authentication username. */
  username: string
  /** The authentication password. */
  password: string
}

/**
 * Bearer token authentication (e.g. OAuth2 or JWT).
 */
export interface BearerAuth {
  type: "bearer"
  /** The bearer token value. */
  token: string
}

/** Authentication credentials — either basic or bearer. */
export type Auth = BasicAuth | BearerAuth

// ─── Trino Headers ───────────────────────────────────────────────────────────

/**
 * Well-known Trino request headers.
 */
export enum TrinoHeader {
  "X-Trino-User",
  "X-Trino-Original-User",
  "X-Trino-Source",
  "X-Trino-Catalog",
  "X-Trino-Schema",
  "X-Trino-Time-Zone",
  "X-Trino-Language",
  "X-Trino-Trace-Token",
  "X-Trino-Session",
  "X-Trino-Role",
  "X-Trino-Prepared-Statement",
  "X-Trino-Transaction-Id",
  "X-Trino-Client-Info",
  "X-Trino-Client-Tags",
  "X-Trino-Resource-Estimate",
  "X-Trino-Extra-Credential",
}

/** A well-known Trino request header name. */
export type TrinoHeaderName = keyof typeof TrinoHeader

// ─── Response Types ──────────────────────────────────────────────────────────

/**
 * Location in the query where an error occurred.
 */
export interface ErrorLocation {
  lineNumber: number
  columnNumber: number
}

/**
 * Detailed failure information including stack trace.
 */
export interface FailureInfo {
  type: string
  message?: string
  cause?: FailureInfo
  suppressed: FailureInfo[]
  stack: string[]
  errorLocation?: ErrorLocation
}

/**
 * Error information when a query fails.
 */
export interface QueryError {
  message: string
  sqlState?: string
  errorCode: number
  errorName: string
  errorType:
    | "USER_ERROR"
    | "INTERNAL_ERROR"
    | "EXTERNAL"
    | "INSUFFICIENT_RESOURCES"
  errorLocation?: ErrorLocation
  failureInfo?: FailureInfo
}

/**
 * Warning from Trino during query execution.
 */
export interface Warning {
  warningCode: { code: number; name: string }
  message: string
}

/**
 * Type signature for complex column types.
 */
export interface ClientTypeSignature {
  rawType: string
  arguments: ClientTypeSignatureParameter[]
}

/**
 * Parameter for type signatures (discriminated union).
 */
export type ClientTypeSignatureParameter =
  | { kind: "TYPE"; typeSignature: ClientTypeSignature }
  | { kind: "LONG"; longLiteral: number }
  | {
      kind: "VARIABLE"
      namedTypeSignature: {
        name?: string
        typeSignature: ClientTypeSignature
      }
    }

/**
 * Column definition in query results.
 */
export interface Column {
  /** Column name. */
  name: string
  /** Type string (e.g. "varchar", "bigint", "array(varchar)"). */
  type: string
  /** Detailed type signature for complex types. */
  typeSignature?: ClientTypeSignature
}

/**
 * Statistics for a query execution stage.
 */
export interface StageStats {
  stageId: string
  state: string
  done: boolean
  nodes: number
  totalSplits: number
  queuedSplits: number
  runningSplits: number
  completedSplits: number
  cpuTimeMillis: number
  wallTimeMillis: number
  processedRows: number
  processedBytes: number
  physicalInputBytes: number
  failedTasks: number
  coordinatorOnly: boolean
  subStages: StageStats[]
}

/**
 * Statistics about query execution.
 */
export interface Stats {
  state: State
  queued: boolean
  scheduled: boolean
  progressPercentage?: number
  runningPercentage?: number
  nodes: number
  totalSplits: number
  queuedSplits: number
  runningSplits: number
  completedSplits: number
  cpuTimeMillis: number
  wallTimeMillis: number
  queuedTimeMillis: number
  elapsedTimeMillis: number
  processedRows: number
  processedBytes: number
  physicalInputBytes: number
  peakMemoryBytes: number
  spilledBytes: number
  rootStage?: StageStats
}

/**
 * Main query results response from Trino.
 */
export interface QueryResult<T = unknown> {
  /** The unique query ID. */
  id: string
  /** URI for the query info page. */
  infoUri: string
  /** URI for partial cancellation. */
  partialCancelUri?: string
  /** URI to fetch next batch of results. If absent, query is complete. */
  nextUri?: string
  /** Column definitions for the result set. */
  columns?: Column[]
  /** Result data rows. */
  data?: T[]
  /** Statistics about query execution. */
  stats: Stats
  /** Error information if query failed. */
  error?: QueryError
  /** List of warnings. */
  warnings: Warning[]
  /** Type of update operation (e.g. "CREATE TABLE"). */
  updateType?: string
  /** Number of rows updated (for DML operations). */
  updateCount?: number
}

// ─── Client Props ────────────────────────────────────────────────────────────

/**
 * Configuration options for creating a TrinoClient instance.
 */
export interface TrinoClientProps {
  /** Trino coordinator hostname including protocol (e.g. `"https://trino.example.com"`). */
  host: string
  /** Port the Trino coordinator listens on. */
  port: number
  /** Authentication credentials — either basic (username/password) or bearer (token). */
  auth: Auth
  /** Default catalog used for all queries. */
  catalog: string
  /** Optional default schema used for all queries. */
  schema?: string
  /**
   * Source identifier sent as `X-Trino-Source` header.
   * @default "nodejs"
   */
  source?: string
  /** Retry configuration for failed requests. */
  retry?: RetryConfig
  /** Default timeout for queries in milliseconds. No timeout when omitted. */
  timeout?: number
}

// ─── Method Props ────────────────────────────────────────────────────────────

/**
 * Parameters for executing a SQL query or stream.
 */
export interface QueryProps<T = unknown> {
  /** The SQL statement to execute. */
  sql: string
  /** Optional Trino user to impersonate via `X-Trino-User`. */
  impersonateAs?: string
  /** Abort signal for cancelling the query. */
  signal?: AbortSignal
  /** Optional transform function to map raw row arrays to typed objects. */
  transform?: (row: unknown[], columns: Column[]) => T
}

/**
 * Parameters for listing schemas in a catalog.
 */
export interface GetSchemasProps {
  /** The catalog to inspect. */
  catalog: string
}

/**
 * Parameters for listing tables in a catalog and schema.
 */
export interface GetTablesProps extends GetSchemasProps {
  /** The schema to inspect. */
  schema: string
}

/**
 * Parameters for listing views in a catalog and schema.
 */
export interface GetViewsProps extends GetSchemasProps {
  /** The schema to inspect. */
  schema: string
}

/**
 * Parameters for listing columns of a table.
 */
export interface GetColumnsProps extends GetTablesProps {
  /** The table to describe. */
  table: string
  /**
   * When true, returns typed objects instead of raw tuples.
   * @default false
   */
  asObject?: boolean
}

/**
 * Column metadata returned by `columns()` when `asObject` is true.
 */
export interface ColumnInfo {
  /** Column name. */
  name: string
  /** Trino data type (e.g. "varchar", "integer", "timestamp(3)"). */
  type: string
  /** Extra column metadata (e.g. partition key info). */
  extra: string
  /** Column description/comment. */
  description: string
}

/**
 * Parameters for dropping a table.
 */
export interface DropTableProps {
  /** The catalog containing the table. */
  catalog: string
  /** The schema containing the table. */
  schema: string
  /** The table name to drop. */
  table: string
}

/**
 * A column definition for CREATE TABLE statements.
 */
export interface ColumnDefinition {
  /** The column name. */
  name: string
  /** The Trino column type (e.g., "VARCHAR", "INTEGER", "TIMESTAMP(3)"). */
  type: string
}

/**
 * Parameters for creating a table.
 */
export interface CreateTableProps {
  /** The catalog to create the table in. */
  catalog: string
  /** The schema to create the table in. */
  schema: string
  /** The table name to create. */
  table: string
  /** Column definitions (name + type pairs). */
  columns: ColumnDefinition[]
  /** Optional WITH clause properties (e.g., external_location, format). */
  properties?: Record<string, string>
  /** Whether to use IF NOT EXISTS (default: true). */
  ifNotExists?: boolean
}
