import type { SourceConfig } from "./adapter"

/**
 * Resolved per-data-source paging limits.
 *
 * Owned by `@lakeql/datasource` so resolved config values flow to the
 * adapter factory and read strategies with compile-time assignability.
 */
export interface ReadStrategyPaging {
  /** Page size used when a request omits `perPage`. */
  defaultPerPage: number
  /** Upper bound a request's `perPage` may not exceed. */
  maxRecordsPerPage: number
}

/**
 * Shared read input that types common values while leaving
 * filter, schema, and context generic for adapter- or API-specific
 * extensibility.
 *
 * @template TFilter - Filter expression understood by the read implementation.
 * @template TSchema - Schema or selection metadata understood by the read implementation.
 * @template TContext - Request-scoped context passed through to the read implementation.
 */
export interface DataSourceReadInput<
  TFilter = unknown,
  TSchema = unknown,
  TContext = unknown,
> {
  /** Table and adapter coordinates for the requested source. */
  sourceConfig: SourceConfig
  /** Source fields to include in the result. */
  selectFields: readonly string[]
  /** Adapter- or API-specific filter expression. */
  filter: TFilter
  /**
   * One-based page number and the requested page size. `perPage` is
   * optional; the strategy substitutes the resolved default when omitted.
   */
  paging: { page: number; perPage?: number }
  /** Adapter- or API-specific sort definitions. */
  sorting: readonly unknown[]
  /** Mapping from source field names to their result aliases. */
  transformFields: Readonly<Record<string, string>>
  /** Fields that require date-specific handling by the adapter. */
  dateFields: readonly string[]
  /** Schema or selection metadata required by the read implementation. */
  schema: TSchema
  /** Request-scoped context passed through without core interpretation. */
  context: TContext
}

/**
 * Neutral read result exposing total count, page information,
 * and typed result nodes.
 *
 * @template T - Shape of each record in the result page.
 */
export interface DataSourceReadResult<T> {
  /** Total number of matching records across all pages. */
  totalCount: number
  /** Paging metadata for the returned result page. */
  pageInfo: {
    /** Total number of available pages, or zero when no records match. */
    maxPages: number
    /** Whether another page is available after this one. */
    hasNext: boolean
    /** Whether a page is available before this one. */
    hasPrevious: boolean
    /** One-based number of the returned page. */
    currentPage: number
    /** One-based number of the next page, or `null` when on the last page. */
    nextPage: number | null
    /** One-based number of the previous page, or `null` when on the first page. */
    previousPage: number | null
  }
  /** Typed records returned for the requested page. */
  nodes: T[]
}

/**
 * Strategy contract for reading data from a data source.
 * Adapter-specific read implementations conform to this interface.
 */
export interface DataSourceReadStrategy {
  /**
   * Reads a page of records. Implementations must validate paging before
   * building or executing their query.
   *
   * @template T - Shape of each record returned by the read strategy.
   * @param input - Source coordinates, selection, filtering, paging, and request context.
   * @returns A typed page of matching records and its paging metadata.
   */
  read: <T>(input: DataSourceReadInput) => Promise<DataSourceReadResult<T>>
}
