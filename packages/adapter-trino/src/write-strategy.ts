import type { DataSource, DataSourceWriteStrategy } from "@lakeql/datasource"
import type { JsonSchema } from "@lakeql/parquet"
import type { PartitioningValue } from "@lakeql/schema-generator/endpoint-schema"
import { createStorageOperations, executeWritePipeline } from "@lakeql/storage"
import type { Serializer } from "@lakeql/storage"
import type { Files } from "files-sdk"

import { createHiveTableManager } from "./hive-table-manager"

/**
 * Configuration for the Trino write strategy factory.
 */
export interface TrinoWriteStrategyConfig {
  /** The files-sdk instance for object storage operations. */
  files: Files
  /** The DataSource instance for DDL operations. */
  dataSource: DataSource
  /**
   * Configured runtime name of the data source. Used only to name the data
   * source in write-method mismatch errors; direct callers may omit it.
   */
  dataSourceName?: string
  /** Serializer for data format conversion (e.g. parquetSerializer()). */
  serializer: Serializer
  /**
   * Override for Hive external_location prefix.
   * Auto-derived from `files.adapter.name` + `files.adapter.bucket` for known providers.
   * Recommended to set explicitly for production/Azure/custom Hadoop connectors.
   */
  externalLocationPrefix?: string
  /** When true, shadow tables are retained after successful DDL. Default: false. */
  keepShadowTables?: boolean
}

/**
 * Creates a Trino-specific {@link DataSourceWriteStrategy} that performs the
 * Upload+DDL pattern via the storage write pipeline.
 *
 * The strategy internally constructs `StorageOperations` from the provided
 * `Files` instance and a `HiveTableManager` from the `DataSource` + `Files`.
 * Write calls are delegated to `executeWritePipeline` with pre-resolved
 * dependencies.
 *
 * @example
 * ```ts
 * import { Files } from "files-sdk"
 * import { s3 } from "files-sdk/s3"
 * import { parquetSerializer } from "@lakeql/storage/serializer/parquet"
 *
 * const writeStrategy = createTrinoWriteStrategy({
 *   files: new Files({ adapter: s3({ bucket: "my-datalake", region: "eu-central-1" }) }),
 *   dataSource: trinoDataSource,
 *   serializer: parquetSerializer(),
 * })
 *
 * await writeStrategy.write({
 *   records: [{ id: 1, name: "test" }],
 *   schema: jsonSchema,
 *   config: {
 *     basePath: "warehouse/analytics/events",
 *     table: { catalog: "hive", schema: "analytics", tableName: "events" },
 *   },
 * })
 * ```
 */
export function createTrinoWriteStrategy(
  config: TrinoWriteStrategyConfig
): DataSourceWriteStrategy {
  const storage = createStorageOperations(config.files)
  const tableManager = createHiveTableManager({
    dataSource: config.dataSource,
    files: config.files,
    externalLocationPrefix: config.externalLocationPrefix,
    keepShadowTables: config.keepShadowTables,
  })

  return {
    async write(input) {
      if (input.config.writeMethod === "insert") {
        const subject = config.dataSourceName
          ? `data source "${config.dataSourceName}"`
          : "this data source"
        throw new Error(
          `Endpoint expects writeMethod "insert", but ${subject} uses the storage write strategy. Set writeConfig.strategy to "insert" for this data source, or use writeMethod "storage" in the endpoint.`
        )
      }

      if (!input.config.basePath) {
        throw new Error(
          "TrinoWriteStrategy requires a basePath in the write config"
        )
      }

      await executeWritePipeline({
        records: input.records,
        jsonSchema: input.schema as JsonSchema,
        config: {
          loadStrategy: input.config.loadStrategy ?? "full_load",
          basePath: input.config.basePath,
          table: input.config.table,
          storage,
          tableManager,
          serializer: config.serializer,
          partitioning: input.config.partitioning as PartitioningValue,
          autoFillFields: input.config.autoFillFields,
          keepShadowTables:
            input.config.keepShadowTables ?? config.keepShadowTables,
        },
      })
    },
  }
}
