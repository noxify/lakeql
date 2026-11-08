/**
 * Definition of a managed table for DDL operations (CREATE/DROP).
 * Used by the write pipeline to manage external tables in the storage backend.
 */
export interface ManagedTableDefinition {
  /** The catalog name. */
  catalog: string
  /** The schema name. */
  schema: string
  /** The table name. */
  tableName: string
  /** External storage location URI (e.g. s3a://bucket/path/). */
  externalLocation: string
  /** Column definitions (name + backend-specific type string). */
  columns: { name: string; type: string }[]
}

/**
 * Per-call options for table recreation operations.
 *
 * These override the table manager's construction-time configuration for a
 * single call, letting the write pipeline apply a caller-resolved value.
 */
export interface TableManagerCallOptions {
  /**
   * When true, shadow tables created during recreation are retained instead
   * of being dropped. Overrides the manager's configured default for this call.
   */
  keepShadowTables?: boolean
}

/**
 * Generic interface for table DDL operations in the write pipeline.
 *
 * Implementations manage the lifecycle of external tables (CREATE, DROP, REPLACE)
 * in a storage-backend-agnostic way. The concrete implementation (e.g. HiveTableManager)
 * delegates DDL execution to a DataSource instance.
 */
export interface TableManager {
  /**
   * Creates a table in the storage backend.
   * Uses IF NOT EXISTS semantics by default.
   */
  createTable: (definition: ManagedTableDefinition) => Promise<void>

  /**
   * Drops a table from the storage backend.
   * Uses IF EXISTS semantics — does not throw if the table doesn't exist.
   */
  dropTable: (catalog: string, schema: string, table: string) => Promise<void>

  /**
   * Drops and recreates a single table.
   * Useful for replacing external tables with updated schemas.
   *
   * @param definition - The table to recreate.
   * @param options - Optional per-call overrides (e.g. `keepShadowTables`).
   */
  recreateTable: (
    definition: ManagedTableDefinition,
    options?: TableManagerCallOptions
  ) => Promise<void>

  /**
   * For full_load_append: manages both _latest and _all tables.
   * Creates both tables, and attempts rollback (best-effort drop both)
   * if either creation fails.
   *
   * @param latest - The `_latest` table definition.
   * @param all - The `_all` table definition.
   * @param options - Optional per-call overrides (e.g. `keepShadowTables`).
   */
  recreateTablePair: (
    latest: ManagedTableDefinition,
    all: ManagedTableDefinition,
    options?: TableManagerCallOptions
  ) => Promise<void>

  /**
   * Builds a properly-formatted external location URI for tables.
   *
   * @param path - The storage object path (without bucket prefix or scheme)
   * @returns The full URI (e.g. `s3a://my-bucket/path/to/data/`)
   */
  buildExternalLocation: (path: string) => string
}
