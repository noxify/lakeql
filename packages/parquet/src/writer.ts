import { parquetWriteBuffer } from "hyparquet-writer"

import { recordsToColumnar } from "./columnar"
import type { JsonSchema } from "./converter"
import { jsonSchemaToParquetSchema } from "./converter"

export interface WriteParquetOptions {
  /** The records to write. */
  records: Record<string, unknown>[]
  /** The JSON Schema describing record structure. */
  jsonSchema: JsonSchema
}

/**
 * Writes an array of records to Parquet format using hyparquet-writer.
 *
 * Internally:
 * 1. Converts JSON Schema → SchemaElement[] via jsonSchemaToParquetSchema
 * 2. Transforms row-oriented records → columnar data arrays
 * 3. Calls hyparquet-writer's parquetWriteBuffer to produce an ArrayBuffer
 *
 * @returns Uint8Array containing the Parquet binary data
 */
export function writeParquet(options: WriteParquetOptions): Uint8Array {
  const { records, jsonSchema } = options

  // 1. Convert JSON Schema to Parquet schema elements
  const schema = jsonSchemaToParquetSchema(jsonSchema)

  // 2. Transform row-oriented records to columnar data
  const columnData = recordsToColumnar(records, jsonSchema)

  // 3. Write Parquet binary using hyparquet-writer
  const buffer = parquetWriteBuffer({ schema, columnData })

  return new Uint8Array(buffer)
}
