import type { JsonSchema } from "@lakeql/parquet"
import { DEFAULT_ROW_GROUP_SIZE, writeParquetStreaming } from "@lakeql/parquet"

import type { Serializer } from "./types"

/**
 * Options for {@link parquetSerializer}.
 */
export interface ParquetSerializerOptions {
  /**
   * Number of rows per Parquet row group. Bounds peak serialization memory.
   *
   * @default 10000
   */
  rowGroupSize?: number
}

/**
 * Creates a Parquet serializer backed by `@lakeql/parquet`'s
 * `writeParquetStreaming`, which bounds peak memory by row group.
 *
 * This is the default serializer for the LakeQL write pipeline.
 *
 * @param options - Optional serializer settings (e.g. `rowGroupSize`).
 * @example
 * ```ts
 * import { parquetSerializer } from "@lakeql/storage/serializer/parquet"
 *
 * const serializer = parquetSerializer({ rowGroupSize: 10_000 })
 * const output = await serializer.serialize(records, jsonSchema)
 * // output.buffer is Uint8Array, output.extension is "parquet"
 * ```
 */
export function parquetSerializer(
  options?: ParquetSerializerOptions
): Serializer {
  const rowGroupSize = options?.rowGroupSize ?? DEFAULT_ROW_GROUP_SIZE
  return {
    async serialize(records, schema) {
      const buffer = writeParquetStreaming({
        records,
        jsonSchema: schema as JsonSchema,
        rowGroupSize,
      })
      return {
        buffer,
        extension: "parquet",
        contentType: "application/vnd.apache.parquet",
      }
    },
  }
}
