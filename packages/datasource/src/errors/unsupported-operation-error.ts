import type { AdapterName } from "../types/adapter"
import { DataSourceError } from "./datasource-error"

/**
 * Operational error for operations that an adapter does not support.
 *
 * Fixes {@link DataSourceError.category | category} to `"unsupported"`
 * and exposes the rejected {@link operation} name.
 */
export class UnsupportedOperationError extends DataSourceError {
  /** Name of the unsupported operation (e.g. `"write"`). */
  readonly operation: string

  /**
   * @param message - Human-readable explanation. Must not contain credentials.
   * @param adapter - Open identifier of the adapter that produced this error.
   * @param dataSource - Runtime name of the data source that produced this error.
   * @param operation - Name of the unsupported operation.
   * @param options - Optional lower-level cause to preserve.
   */
  constructor(
    message: string,
    adapter: AdapterName,
    dataSource: string,
    operation: string,
    options?: { cause?: unknown }
  ) {
    super(message, adapter, dataSource, "unsupported", options)
    this.name = "UnsupportedOperationError"
    this.operation = operation
  }
}
