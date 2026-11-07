import type { ColumnSource } from "hyparquet-writer"
import { ByteWriter, parquetWriteRows } from "hyparquet-writer"

import type { JsonSchema } from "./converter"
import { jsonSchemaToParquetSchema } from "./converter"
import { transformRows } from "./row-transform"

/** Default number of rows per row group. Controls peak memory. */
export const DEFAULT_ROW_GROUP_SIZE = 10_000

/**
 * Column definition for {@link parquetWriteRows}: the `ColumnSource` shape
 * without its `data` field. Fixes column names and order; structure and
 * nullability come from the supplied Parquet schema.
 */
export type ColumnDef = Omit<ColumnSource, "data">

/**
 * Derives the column definitions (name and order) for `parquetWriteRows`
 * from a JSON Schema's top-level properties.
 *
 * Only the column name and order are emitted here; the actual column types,
 * nesting, and nullability are described by the `SchemaElement[]` produced by
 * {@link jsonSchemaToParquetSchema} and passed alongside.
 *
 * @param jsonSchema - Object schema whose top-level properties become columns.
 * @returns One {@link ColumnDef} per top-level property, in declaration order.
 */
export function jsonSchemaToColumnDefs(jsonSchema: JsonSchema): ColumnDef[] {
  const properties = jsonSchema.properties ?? {}
  return Object.keys(properties).map((name) => ({ name }))
}

/**
 * Options for {@link writeParquetStreaming}.
 */
export interface WriteParquetStreamingOptions {
  /** The records to write (row-oriented). */
  records: Record<string, unknown>[]
  /** The JSON Schema describing record structure. */
  jsonSchema: JsonSchema
  /**
   * Number of rows per row group. Bounds peak memory.
   *
   * @default 10000
   */
  rowGroupSize?: number
}

/**
 * Writes records to Parquet with row-group-bounded memory.
 *
 * Unlike {@link writeParquet}, which transposes the entire dataset into columns
 * before writing, this pulls rows lazily and lets `parquetWriteRows` transpose
 * one row group at a time, so peak memory scales with `rowGroupSize` rather than
 * the total row count. The complete output still lives in the returned buffer.
 *
 * @param options - Records, schema, and optional `rowGroupSize`.
 * @returns The Parquet binary as a `Uint8Array`.
 * @throws {Error} When `rowGroupSize` is not a positive integer.
 */
export function writeParquetStreaming(
  options: WriteParquetStreamingOptions
): Uint8Array {
  const { records, jsonSchema, rowGroupSize = DEFAULT_ROW_GROUP_SIZE } = options

  if (!Number.isInteger(rowGroupSize) || rowGroupSize <= 0) {
    throw new Error(
      `rowGroupSize must be a positive integer, received: ${rowGroupSize}`
    )
  }

  const schema = jsonSchemaToParquetSchema(jsonSchema)
  const columns = jsonSchemaToColumnDefs(jsonSchema)
  const writer = new ByteWriter()

  parquetWriteRows({
    writer,
    rows: transformRows(records, jsonSchema),
    columns,
    schema,
    rowGroupSize,
  })

  return writer.getBytes()
}
