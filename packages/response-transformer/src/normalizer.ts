import type { AdapterName } from "@lakeql/datasource"

/**
 * Neutral input shape consumed by {@link ResponseNormalizer.normalize}.
 *
 * Contains the raw query response rows and metadata needed to convert
 * backend-specific values into the shared {@link NormalizedResponse} shape.
 */
export interface ResponseNormalizationInput {
  /** Raw rows returned by the data source query. */
  response: readonly unknown[]
  /** Field names selected by the caller. */
  selectFields: readonly string[]
  /** Mapping from source field names to target field names. */
  transformFields: Readonly<Record<string, string>>
  /** Field names that carry date/timestamp values. */
  dateFields: readonly string[]
  /** Backend-specific schema used for value interpretation. */
  schema: unknown
}

/**
 * Result shape produced by {@link ResponseNormalizer.normalize}.
 *
 * @template T - Shape of each record in the returned data array.
 */
export interface NormalizedResponse<T> {
  /** Total number of records matching the query, before paging. */
  totalCount: number
  /** Transformed records for the current page. */
  data: T[]
}

/**
 * Adapter-neutral contract for converting raw query response rows into a
 * {@link NormalizedResponse}.
 *
 * Concrete adapters implement this interface to own backend-specific value
 * conversion, schema interpretation, and total-count extraction. The shared
 * SQL read strategy passes neutral input through unchanged and never branches
 * on adapter names.
 */
export interface ResponseNormalizer {
  /** Open identifier of the adapter that owns this normalizer. */
  readonly adapterName: AdapterName

  /**
   * Convert raw response rows into a normalized result.
   *
   * @template T - Shape of each record in the returned data array.
   * @param input - Neutral normalization parameters.
   * @returns Normalized response containing total count and typed data.
   */
  normalize: <T>(input: ResponseNormalizationInput) => NormalizedResponse<T>
}
