/* eslint-disable max-classes-per-file */

/**
 * Base error for Trino client errors.
 */
export class TrinoClientError extends Error {
  /** HTTP status code if available. */
  readonly statusCode?: number

  /**
   * @param message - Human-readable error message.
   * @param statusCode - HTTP status code from the Trino response.
   */
  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = "TrinoClientError"
    this.statusCode = statusCode
  }
}

/**
 * Error during Trino query execution (Trino returned an error in the response).
 */
export class TrinoQueryError extends Error {
  /** The Trino query ID that failed. */
  readonly queryId: string
  /** Trino error code. */
  readonly errorCode: number
  /** Trino error name (e.g. "TABLE_NOT_FOUND"). */
  readonly errorName: string
  /** Trino error type (e.g. "USER_ERROR", "INTERNAL_ERROR"). */
  readonly errorType: string

  /**
   * @param message - Human-readable error message from Trino.
   * @param queryId - The Trino query ID that produced the error.
   * @param errorCode - Numeric Trino error code.
   * @param errorName - Trino error name (e.g. "TABLE_NOT_FOUND").
   * @param errorType - Trino error type (e.g. "USER_ERROR", "INTERNAL_ERROR").
   */
  constructor(
    message: string,
    queryId: string,
    errorCode: number,
    errorName: string,
    errorType: string
  ) {
    super(message)
    this.name = "TrinoQueryError"
    this.queryId = queryId
    this.errorCode = errorCode
    this.errorName = errorName
    this.errorType = errorType
  }
}

/**
 * Error when a query exceeds its timeout.
 */
export class TrinoTimeoutError extends Error {
  /** The query ID that timed out, if available. */
  readonly queryId?: string

  /**
   * @param message - Human-readable timeout error message.
   * @param queryId - The query ID that timed out, if known.
   */
  constructor(message: string, queryId?: string) {
    super(message)
    this.name = "TrinoTimeoutError"
    this.queryId = queryId
  }
}

/**
 * Error when a query is cancelled via AbortSignal.
 */
export class TrinoCancellationError extends Error {
  /** The query ID that was cancelled. */
  readonly queryId?: string

  /**
   * @param message - Human-readable cancellation message.
   * @param queryId - The query ID that was cancelled, if known.
   */
  constructor(message: string, queryId?: string) {
    super(message)
    this.name = "TrinoCancellationError"
    this.queryId = queryId
  }
}
