/**
 * Supported load strategies for write operations.
 *
 * - `full_load` — replace the target table completely
 * - `full_load_append` — replace existing partitions; append new ones
 * - `append` — add records without removing existing data
 */
export type LoadStrategy = "full_load" | "full_load_append" | "append"

/**
 * Shared write configuration containing table coordinates and
 * optional common write settings. Storage-backed strategies may
 * require `basePath`; direct-insert strategies omit it.
 */
export interface DataSourceWriteConfig {
  /** Catalog, schema, and table name of the write target. */
  table: { catalog: string; schema: string; tableName: string }
  /** Behavior to apply when records reach an existing target. */
  loadStrategy?: LoadStrategy
  /** Storage base path required by storage-backed write strategies. */
  basePath?: string
  /**
   * When `true`, instructs strategies that manage shadow tables
   * to retain them after the write completes. Useful for debugging
   * or auditing intermediate state.
   */
  keepShadowTables?: boolean
  /**
   * Reserved for future idempotency support. Accepting this value
   * now ensures forward-compatible configuration, but it has no
   * current behavioral effect.
   */
  writeId?: string
  /** Adapter-owned partitioning configuration. */
  partitioning?: unknown
  /** Adapter-owned format for partition values. */
  partitioningFormat?: string
}

/**
 * Schema-library-agnostic write input containing records, a generic
 * schema value, and write configuration.
 */
export interface DataSourceWriteInput {
  /** Records to write to the configured target. */
  records: Record<string, unknown>[]
  /** Schema understood by the adapter-owned write implementation. */
  schema: unknown
  /** Common and adapter-owned settings for this write. */
  config: DataSourceWriteConfig
}

/**
 * Strategy contract for writing data to a data source.
 * Adapter-specific write implementations conform to this interface.
 */
export interface DataSourceWriteStrategy {
  /**
   * Writes the supplied records and completes when the write has finished.
   *
   * @param input - Records, schema, and configuration for the write operation.
   */
  write: (input: DataSourceWriteInput) => Promise<void>
}
