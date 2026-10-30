/**
 * Storage package for LakeQL.
 *
 * Provides the write pipeline, storage operations, the generic
 * TableManager interface for DDL lifecycle management, and the
 * pluggable Serializer interface.
 *
 * Hive-specific DDL implementation (HiveTableManager) lives in
 * `@lakeql/adapter-trino`. This package only exports the generic
 * `TableManager` interface contract.
 */

export { createStorageOperations, StorageError } from "./storage-operations"
export type { StorageOperations, UploadOptions } from "./storage-operations"
export type {
  TableManager,
  TableManagerCallOptions,
  ManagedTableDefinition,
} from "./table-manager/types"
export {
  executeWritePipeline,
  generatePartitionPath,
  generateFlatPath,
  resolvePartitioningConfig,
  enrichJsonSchemaWithTimestamp,
  injectLoadTimestamp,
  PartitionFieldError,
  parsePartitioningFormat,
  generateCustomPartitionPath,
  groupRecordsByCustomPartition,
} from "./write-pipeline"
export type {
  PartitionMode,
  ResolvedPartitioning,
  WritePipelineConfig,
  WritePipelineInput,
  PartitionSegment,
} from "./write-pipeline"
// Canonical load-strategy union, re-exported from @lakeql/datasource so storage
// consumers keep importing `LoadStrategy` from @lakeql/storage unchanged.
export type { LoadStrategy } from "@lakeql/datasource"
export type { Serializer, SerializerOutput } from "./serializer/types"
export { WritePipelineError } from "./write-pipeline-error"
export type { WritePipelinePhase } from "./write-pipeline-error"
