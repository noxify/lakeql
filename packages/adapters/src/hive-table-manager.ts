import type { TrinoClient } from "@lakeql/trino-client"

/**
 * Configuration for the Hive Table Manager.
 */
export interface HiveTableManagerConfig {
  /** The Trino client instance to use for DDL operations. */
  client: TrinoClient
  /** S3 bucket name for external table locations. */
  bucket: string
}

/**
 * Definition of a Hive external table to create.
 */
export interface HiveTableDefinition {
  /** The catalog name. */
  catalog: string
  /** The schema name. */
  schema: string
  /** The table name. */
  tableName: string
  /** S3 location for the external table. */
  externalLocation: string
  /** SQL column definitions from JSON Schema. */
  columns: { name: string; type: string }[]
}

/**
 * Manages Hive external table DDL operations (DROP + CREATE)
 * for the mutation write pipeline.
 */
export interface HiveTableManager {
  /**
   * Drops and recreates a single Hive external table.
   * Executes DROP TABLE IF EXISTS followed by CREATE TABLE.
   */
  recreateTable: (definition: HiveTableDefinition) => Promise<void>

  /**
   * For full_load_append: manages both _latest and _all tables.
   * Creates both tables, and attempts rollback (best-effort drop both)
   * if either creation fails.
   */
  recreateTablePair: (
    latestDefinition: HiveTableDefinition,
    allDefinition: HiveTableDefinition
  ) => Promise<void>
}

/**
 * Creates a HiveTableManager that executes DDL via the Trino client.
 *
 * @example
 * ```ts
 * const manager = createHiveTableManager({
 *   client: trinoClient,
 *   bucket: "my-datalake",
 * })
 *
 * await manager.recreateTable({
 *   catalog: "hive",
 *   schema: "analytics",
 *   tableName: "user_events",
 *   externalLocation: "s3://my-datalake/warehouse/analytics/user_events/latest.parquet",
 *   columns: [
 *     { name: "event_id", type: "VARCHAR" },
 *     { name: "timestamp", type: "TIMESTAMP(3)" },
 *   ],
 * })
 * ```
 */
export function createHiveTableManager(
  config: HiveTableManagerConfig
): HiveTableManager {
  const { client } = config

  async function recreateTable(definition: HiveTableDefinition): Promise<void> {
    await client.dropTable({
      catalog: definition.catalog,
      schema: definition.schema,
      table: definition.tableName,
    })

    await client.createTable({
      catalog: definition.catalog,
      schema: definition.schema,
      table: definition.tableName,
      columns: definition.columns,
      properties: {
        external_location: definition.externalLocation,
        format: "PARQUET",
      },
      ifNotExists: false,
    })
  }

  async function recreateTablePair(
    latestDefinition: HiveTableDefinition,
    allDefinition: HiveTableDefinition
  ): Promise<void> {
    // Drop both tables first
    await client.dropTable({
      catalog: latestDefinition.catalog,
      schema: latestDefinition.schema,
      table: latestDefinition.tableName,
    })

    await client.dropTable({
      catalog: allDefinition.catalog,
      schema: allDefinition.schema,
      table: allDefinition.tableName,
    })

    // Create both tables — if one fails, attempt best-effort rollback
    try {
      await client.createTable({
        catalog: latestDefinition.catalog,
        schema: latestDefinition.schema,
        table: latestDefinition.tableName,
        columns: latestDefinition.columns,
        properties: {
          external_location: latestDefinition.externalLocation,
          format: "PARQUET",
        },
        ifNotExists: false,
      })

      await client.createTable({
        catalog: allDefinition.catalog,
        schema: allDefinition.schema,
        table: allDefinition.tableName,
        columns: allDefinition.columns,
        properties: {
          external_location: allDefinition.externalLocation,
          format: "PARQUET",
        },
        ifNotExists: false,
      })
    } catch (error) {
      // Best-effort rollback: attempt to drop both tables
      let rollbackSucceeded = true
      try {
        await client.dropTable({
          catalog: latestDefinition.catalog,
          schema: latestDefinition.schema,
          table: latestDefinition.tableName,
        })
      } catch {
        rollbackSucceeded = false
      }

      try {
        await client.dropTable({
          catalog: allDefinition.catalog,
          schema: allDefinition.schema,
          table: allDefinition.tableName,
        })
      } catch {
        rollbackSucceeded = false
      }

      // Propagate original error with rollback status
      const originalMessage =
        error instanceof Error ? error.message : String(error)
      const rollbackNote = rollbackSucceeded
        ? "Rollback succeeded: both tables were dropped."
        : "Rollback partially failed: some tables may still exist."

      throw new Error(
        `Failed to create table pair: ${originalMessage}. ${rollbackNote}`,
        { cause: error }
      )
    }
  }

  return {
    recreateTable,
    recreateTablePair,
  }
}
