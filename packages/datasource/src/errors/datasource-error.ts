import type { AdapterName } from "../types/adapter"

/**
 * Category strings that classify operational datasource errors.
 *
 * Each category maps to a specific {@link DataSourceError} subclass,
 * allowing consumers to branch on the category without `instanceof`
 * checks or message parsing.
 */
export type DataSourceErrorCategory =
  | "auth"
  | "query"
  | "network"
  | "timeout"
  | "cancelled"
  | "unsupported"

/**
 * Base operational error for datasource failures.
 *
 * Every instance carries a fixed {@link category}, the
 * {@link adapter} name and {@link dataSource} identifier that
 * produced the failure, and optionally the lower-level
 * {@link Error.cause | cause}.
 *
 * Adapter-owned configuration and connection errors remain the
 * adapter's responsibility — they should extend their own error
 * types, not this one.
 */
export class DataSourceError extends Error {
  /** Open identifier of the adapter that produced this error. */
  readonly adapter: AdapterName
  /** Runtime name of the data source that produced this error. */
  readonly dataSource: string
  /** Fixed category classifying this operational error. */
  readonly category: DataSourceErrorCategory

  /**
   * @param message - Human-readable explanation of the failure. Must not contain credentials.
   * @param adapter - Open identifier of the adapter that produced this error.
   * @param dataSource - Runtime name of the data source that produced this error.
   * @param category - Fixed category for this error class.
   * @param options - Optional lower-level cause to preserve.
   */
  constructor(
    message: string,
    adapter: AdapterName,
    dataSource: string,
    category: DataSourceErrorCategory,
    options?: { cause?: unknown }
  ) {
    super(message, { cause: options?.cause })
    this.name = "DataSourceError"
    this.adapter = adapter
    this.dataSource = dataSource
    this.category = category
  }
}
