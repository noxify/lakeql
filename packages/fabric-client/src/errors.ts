/* eslint-disable max-classes-per-file */

/**
 * Base error for Fabric client errors.
 */
export class FabricClientError extends Error {
  /** HTTP status code if available. */
  readonly statusCode?: number

  /**
   * @param message - Human-readable error message.
   * @param statusCode - HTTP status code from the Fabric response.
   */
  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = "FabricClientError"
    this.statusCode = statusCode
  }
}

/**
 * Error during Fabric query execution (the server returned an error).
 */
export class FabricQueryError extends Error {
  /** Fabric error number from the TDS response. */
  readonly errorNumber: number
  /** SQL state code. */
  readonly state: number

  /**
   * @param message - Human-readable error message from Fabric.
   * @param errorNumber - Numeric error number from the TDS response.
   * @param state - SQL state code.
   */
  constructor(message: string, errorNumber: number, state: number) {
    super(message)
    this.name = "FabricQueryError"
    this.errorNumber = errorNumber
    this.state = state
  }
}

/**
 * Error when a query exceeds its timeout.
 */
export class FabricTimeoutError extends Error {
  /**
   * @param message - Human-readable timeout error message.
   */
  constructor(message: string) {
    super(message)
    this.name = "FabricTimeoutError"
  }
}

/**
 * Error when a query is cancelled via AbortSignal.
 */
export class FabricCancellationError extends Error {
  /**
   * @param message - Human-readable cancellation message.
   */
  constructor(message: string) {
    super(message)
    this.name = "FabricCancellationError"
  }
}
