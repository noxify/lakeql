import {
  AuthenticationError,
  CancellationError,
  DataSourceError,
  NetworkError,
  QueryExecutionError,
  TimeoutError,
} from "@lakeql/datasource"
import {
  TrinoCancellationError,
  TrinoClientError,
  TrinoQueryError,
  TrinoTimeoutError,
} from "@lakeql/trino-client"

import { ADAPTER_NAME } from "./constants"

/**
 * Classify a Trino client error into the shared {@link DataSourceError}
 * hierarchy.
 *
 * The classifier always sets `adapter` to `"trino"` and preserves the
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
/**
 * Trino error names whose message is an access-control decision and is safe to
 * surface verbatim. These messages describe the denied action and the
 * fully-qualified object (e.g. "Access Denied: Cannot select from table
 * catalog.schema.table") — they carry no credentials, no values, and no raw
 * SQL, unlike (for example) SYNTAX_ERROR, whose message echoes the statement.
 */
const SAFE_MESSAGE_ERROR_NAMES: ReadonlySet<string> = new Set([
  "PERMISSION_DENIED",
])

/**
 * Builds the `QueryExecutionError` message for a Trino query failure.
 *
 * Always includes the error name and type. For access-control failures (see
 * {@link SAFE_MESSAGE_ERROR_NAMES}) the Trino message is appended, since it
 * names the denied action and object without leaking credentials or SQL. Other
 * error types keep just the name/type, because their messages can echo the
 * submitted statement.
 */
function formatQueryErrorMessage(error: TrinoQueryError): string {
  const base = `Trino query failed: ${error.errorName} (${error.errorType})`

  if (SAFE_MESSAGE_ERROR_NAMES.has(error.errorName) && error.message !== "") {
    return `${base}: ${error.message}`
  }

  return base
}

export function classifyTrinoError(
  error: unknown,
  dataSource: string
): DataSourceError {
  // Pass-through: already-classified DataSourceError (strict reference identity).
  if (error instanceof DataSourceError) {
    return error
  }

  const cause = { cause: error }

  // TrinoQueryError → QueryExecutionError with diagnostic detail.
  if (error instanceof TrinoQueryError) {
    return new QueryExecutionError(
      formatQueryErrorMessage(error),
      ADAPTER_NAME,
      dataSource,
      cause
    )
  }

  // TrinoClientError → status-based classification.
  if (error instanceof TrinoClientError) {
    const status = error.statusCode

    if (status === 401 || status === 403) {
      return new AuthenticationError(
        `Trino authentication failed (HTTP ${status})`,
        ADAPTER_NAME,
        dataSource,
        cause
      )
    }

    if (status === 408 || status === 504) {
      return new TimeoutError(
        `Trino request timed out (HTTP ${status})`,
        ADAPTER_NAME,
        dataSource,
        cause
      )
    }

    if (status === undefined || status === 0) {
      return new NetworkError(
        "Trino network error: no HTTP response received",
        ADAPTER_NAME,
        dataSource,
        cause
      )
    }

    return new QueryExecutionError(
      `Trino client error (HTTP ${status})`,
      ADAPTER_NAME,
      dataSource,
      cause
    )
  }

  // TrinoTimeoutError → TimeoutError.
  if (error instanceof TrinoTimeoutError) {
    return new TimeoutError(
      "Trino query timed out",
      ADAPTER_NAME,
      dataSource,
      cause
    )
  }

  // TrinoCancellationError → CancellationError.
  if (error instanceof TrinoCancellationError) {
    return new CancellationError(
      "Trino query was cancelled",
      ADAPTER_NAME,
      dataSource,
      cause
    )
  }

  // DOMException — timeout or abort signals.
  if (error instanceof DOMException) {
    if (error.name === "TimeoutError") {
      return new TimeoutError(
        "Trino request timed out",
        ADAPTER_NAME,
        dataSource,
        cause
      )
    }
    if (error.name === "AbortError") {
      return new CancellationError(
        "Trino request was aborted",
        ADAPTER_NAME,
        dataSource,
        cause
      )
    }
  }

  // TypeError — typically a fetch/network failure (DNS, connection refused, TLS).
  if (error instanceof TypeError) {
    return new NetworkError(
      "Trino network error",
      ADAPTER_NAME,
      dataSource,
      cause
    )
  }

  // DOMException with unrecognized name or any other non-Error value.
  const message =
    error instanceof DOMException
      ? `Trino unexpected DOMException: ${error.name}`
      : "Trino unknown error"
  return new QueryExecutionError(message, ADAPTER_NAME, dataSource, cause)
}
