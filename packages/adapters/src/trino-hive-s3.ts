import type { TrinoClient } from "@lakeql/trino-client"

import type { AdapterConfig, StorageAdapter, TableDefinition } from "./types"

/**
 * Configuration for the Trino + Hive + S3 adapter.
 */
export interface TrinoHiveS3Config extends AdapterConfig {
  type: "trino-hive-s3"
  /** The Trino client instance to use for DDL operations. */
  client: TrinoClient
  /** S3 bucket name for external table locations. */
  bucket: string
  /** Optional base prefix within the bucket (default: ""). */
  prefix?: string
  /** Storage format (default: "PARQUET"). */
  format?: "PARQUET" | "ORC" | "AVRO" | "JSON"
}

/**
 * Adapter for Hive external tables stored on S3.
 *
 * Generates CREATE TABLE statements with:
 * - `external_location` pointing to `s3://<bucket>/<prefix>/<schema>/<table>`
 * - `format` set to the configured format (default: PARQUET)
 *
 * @example
 * ```ts
 * const adapter = createTrinoHiveS3Adapter({
 *   client: trinoClient,
 *   bucket: "my-datalake",
 *   prefix: "warehouse",
 *   format: "PARQUET",
 * })
 *
 * await adapter.replaceTable({
 *   catalog: "hive",
 *   schema: "analytics",
 *   table: "user_events",
 *   columns: [
 *     { name: "event_id", type: "VARCHAR" },
 *     { name: "timestamp", type: "TIMESTAMP(3)" },
 *   ],
 * })
 * ```
 */
export function createTrinoHiveS3Adapter(
  config: Omit<TrinoHiveS3Config, "type">
): StorageAdapter<TrinoHiveS3Config> {
  const { client, bucket, prefix = "", format = "PARQUET" } = config

  function buildS3Path(schema: string, table: string): string {
    const parts = [bucket, prefix, schema, table].filter(Boolean)
    return `s3://${parts.join("/")}`
  }

  return {
    type: "trino-hive-s3",

    async createTable(definition: TableDefinition): Promise<void> {
      const s3Path = buildS3Path(definition.schema, definition.table)

      await client.createTable({
        catalog: definition.catalog,
        schema: definition.schema,
        table: definition.table,
        columns: definition.columns,
        properties: {
          external_location: s3Path,
          format,
        },
        ifNotExists: true,
      })
    },

    async dropTable(
      catalog: string,
      schema: string,
      table: string
    ): Promise<void> {
      await client.dropTable({ catalog, schema, table })
    },

    async replaceTable(definition: TableDefinition): Promise<void> {
      await client.dropTable({
        catalog: definition.catalog,
        schema: definition.schema,
        table: definition.table,
      })

      const s3Path = buildS3Path(definition.schema, definition.table)

      await client.createTable({
        catalog: definition.catalog,
        schema: definition.schema,
        table: definition.table,
        columns: definition.columns,
        properties: {
          external_location: s3Path,
          format,
        },
        ifNotExists: false,
      })
    },
  }
}
