/**
 * Serializer interface for pluggable data format support.
 *
 * Decouples the serialization format from the write pipeline,
 * allowing custom formats (Parquet, ORC, Avro, etc.) to be used
 * without changing pipeline logic.
 */

/**
 * Output produced by a Serializer.
 *
 * The `extension` field is the single source of truth for the file format —
 * it is NOT duplicated on the Serializer interface itself.
 */
export interface SerializerOutput {
  /** The serialized buffer ready for upload. */
  buffer: Uint8Array
  /** File extension (without dot), e.g. "parquet", "orc", "avro". */
  extension: string
  /** Optional MIME type for the serialized format. */
  contentType?: string
}

/**
 * A pluggable serializer that converts records + schema into a binary buffer.
 *
 * The `serialize()` method is async to support future streaming/worker-based
 * or externally implemented serializers that may need I/O.
 */
export interface Serializer {
  /**
   * Serialize records to a buffer in this format.
   */
  serialize: (
    records: Record<string, unknown>[],
    schema: unknown
  ) => Promise<SerializerOutput>
}
