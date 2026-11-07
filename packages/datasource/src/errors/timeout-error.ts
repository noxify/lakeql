import type { AdapterName } from "../types/adapter"
import { DataSourceError } from "./datasource-error"

/**
 * Operational error for operations that exceeded a time limit.
 *
 * Fixes {@link DataSourceError.category | category} to `"timeout"`.
 */
export class TimeoutError extends DataSourceError {
  /**
   * @param message - Human-readable explanation of the timeout. Must not contain credentials.
   * @param adapter - Open identifier of the adapter that produced this error.
   * @param dataSource - Runtime name of the data source that produced this error.
   * @param options - Optional lower-level cause to preserve.
   */
  constructor(
    message: string,
    adapter: AdapterName,
    dataSource: string,
    options?: { cause?: unknown }
  ) {
    super(message, adapter, dataSource, "timeout", options)
    this.name = "TimeoutError"
  }
}
