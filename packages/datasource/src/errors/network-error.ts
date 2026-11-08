import type { AdapterName } from "../types/adapter"
import { DataSourceError } from "./datasource-error"

/**
 * Operational error for network-level failures (connection refused,
 * DNS resolution, TLS handshake, etc.).
 *
 * Fixes {@link DataSourceError.category | category} to `"network"`.
 */
export class NetworkError extends DataSourceError {
  /**
   * @param message - Human-readable explanation of the network failure. Must not contain credentials.
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
    super(message, adapter, dataSource, "network", options)
    this.name = "NetworkError"
  }
}
