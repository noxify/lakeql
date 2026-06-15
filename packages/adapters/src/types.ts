import type { ColumnDefinition } from "@lakeql/trino-client"

/**
 * A table definition describing what to create in the storage backend.
 */
export interface TableDefinition {
  /** The catalog name. */
  catalog: string
  /** The schema name. */
  schema: string
  /** The table name. */
  table: string
  /** Column definitions (name + backend-specific type). */
  columns: ColumnDefinition[]
}

/**
 * Base configuration shared by all adapters.
 */
export interface AdapterConfig {
  /** Unique identifier for this adapter type. */
  type: string
}

/**
 * The storage adapter interface.
 *
 * Each adapter implements these methods to provide table management
 * for a specific storage backend (e.g., Hive/S3, Iceberg, ClickHouse).
 */
export interface StorageAdapter<TConfig extends AdapterConfig = AdapterConfig> {
  /** The adapter type identifier. */
  readonly type: TConfig["type"]

  /**
   * Creates a table in the storage backend.
   * Uses IF NOT EXISTS by default.
   */
  createTable: (definition: TableDefinition) => Promise<void>

  /**
   * Drops a table from the storage backend.
   * Uses IF EXISTS — does not throw if the table doesn't exist.
   */
  dropTable: (catalog: string, schema: string, table: string) => Promise<void>

  /**
   * Drops and recreates a table.
   * Useful for replacing external tables with updated schemas.
   */
  replaceTable: (definition: TableDefinition) => Promise<void>
}
