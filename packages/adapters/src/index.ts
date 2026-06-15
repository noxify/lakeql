/**
 * Storage adapters for LakeQL.
 *
 * Adapters provide high-level table management operations (create, drop, replace)
 * for different storage backends. Each adapter knows how to translate endpoint
 * definitions into backend-specific DDL and storage configuration.
 *
 * Available adapters:
 * - `@lakeql/adapters/trino-hive-s3` — Hive external tables on S3 with Parquet format
 */

export type { StorageAdapter, AdapterConfig, TableDefinition } from "./types"
export { createStorageOperations, StorageError } from "./storage-operations"
export type { S3Config, StorageOperations } from "./storage-operations"
export type {
  HiveTableManager,
  HiveTableManagerConfig,
  HiveTableDefinition,
} from "./hive-table-manager"
export { createHiveTableManager } from "./hive-table-manager"
export { executeWritePipeline, generatePartitionPath } from "./write-pipeline"
export type {
  LoadStrategy,
  WritePipelineConfig,
  WritePipelineInput,
} from "./write-pipeline"
