/**
 * JSON Schema to Parquet conversion and writing.
 *
 * Provides utilities to convert JSON Schema definitions into hyparquet-compatible
 * Parquet schemas, transform row-oriented records into columnar format, and write
 * Parquet binary data.
 */

export { jsonSchemaToParquetSchema } from "./converter"
export type { JsonSchema } from "./converter"
export { writeParquet } from "./writer"
export { recordsToColumnar } from "./columnar"
