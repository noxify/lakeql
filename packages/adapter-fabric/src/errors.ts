import {
  AuthenticationError,
  CancellationError,
  DataSourceError,
  NetworkError,
  QueryExecutionError,
  TimeoutError,
} from "@lakeql/datasource"
import {
  FabricCancellationError,
  FabricClientError,
  FabricQueryError,
  FabricTimeoutError,
} from "@lakeql/fabric-client"

import { ADAPTER_NAME } from "./constants"

/**
 * Classify a Fabric client error into the shared {@link DataSourceError}
 * hierarchy.
 *
 * The classifier always sets `adapter` to `"fabric"` and preserves the
 * original error as `cause`. Error messages are bounded and
 * credential-safe — they never include passwords, tokens,
 * authorization headers, raw SQL, or complete request options.
 *
 * Already-classified {@link DataSourceError} instances are returned
 * unchanged with strict reference identity (no double-wrapping).
 *
 * @param error - The caught error value (may be any type).
 * @param dataSource - Runtime name of the data source for error context.
 * @returns A concrete {@link DataSourceError} subclass instance.
 */
export function classifyFabricError(
  error: unknown,
  dataSource: string
): DataSourceError {
  // Pass-through: already-classified DataSourceError (strict reference identity).
  if (error instanceof DataSourceError) {
    return error
  }

  const cause = { cause: error }

  // FabricQueryError → QueryExecutionError with diagnostic detail.
  if (error instanceof FabricQueryError) {
    return new QueryExecutionError(
      `Fabric query failed: error ${error.errorNumber} (state ${error.state})`,
      ADAPTER_NAME,
      dataSource,
      cause
    )
  }

  // FabricClientError → status-based classification.
  if (error instanceof FabricClientError) {
    const status = error.statusCode

    if (status === 401 || status === 403) {
      return new AuthenticationError(
        `Fabric authentication failed (HTTP ${status})`,
        ADAPTER_NAME,
        dataSource,
        cause
      )
    }

    if (status === 408 || status === 504) {
      return new TimeoutError(
        `Fabric request timed out (HTTP ${status})`,
        ADAPTER_NAME,
        dataSource,
        cause
      )
    }

    if (status === undefined || status === 0) {
      return new NetworkError(
        "Fabric network error: no response received",
        ADAPTER_NAME,
        dataSource,
        cause
      )
    }

    return new QueryExecutionError(
      `Fabric client error (HTTP ${status})`,
      ADAPTER_NAME,
      dataSource,
      cause
    )
  }

  // FabricTimeoutError → TimeoutError.
  if (error instanceof FabricTimeoutError) {
    return new TimeoutError(
      "Fabric query timed out",
      ADAPTER_NAME,
      dataSource,
      cause
    )
  }

  // FabricCancellationError → CancellationError.
  if (error instanceof FabricCancellationError) {
    return new CancellationError(
      "Fabric query was cancelled",
      ADAPTER_NAME,
      dataSource,
      cause
    )
  }

  // DOMException — timeout or abort signals.
  if (error instanceof DOMException) {
    if (error.name === "TimeoutError") {
      return new TimeoutError(
        "Fabric request timed out",
        ADAPTER_NAME,
        dataSource,
        cause
      )
    }
    if (error.name === "AbortError") {
      return new CancellationError(
        "Fabric request was aborted",
        ADAPTER_NAME,
        dataSource,
        cause
      )
    }
  }

  // TypeError — typically a fetch/network failure (DNS, connection refused, TLS).
  if (error instanceof TypeError) {
    return new NetworkError(
      "Fabric network error",
      ADAPTER_NAME,
      dataSource,
      cause
    )
  }

  // DOMException with unrecognized name or any other non-Error value.
  const message =
    error instanceof DOMException
      ? `Fabric unexpected DOMException: ${error.name}`
      : "Fabric unknown error"
  return new QueryExecutionError(message, ADAPTER_NAME, dataSource, cause)
}
