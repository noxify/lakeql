/**
 * JSON Schema to Parquet conversion and writing.
 *
 * Provides utilities to convert JSON Schema definitions into hyparquet-compatible
 * Parquet schemas, transform row-oriented records into columnar format, and write
 * Parquet binary data.
 */

export { jsonSchemaToParquetSchema } from "./converter"
export type { JsonSchema } from "./converter"
export {
  DEFAULT_ROW_GROUP_SIZE,
  jsonSchemaToColumnDefs,
  writeParquetStreaming,
} from "./streaming"
export type { ColumnDef, WriteParquetStreamingOptions } from "./streaming"
export { transformRecord, transformRows } from "./row-transform"
