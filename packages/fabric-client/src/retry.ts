/**
 * Automatic retry with exponential backoff for transient Fabric failures.
 *
 * @module
 */

import {
  FabricCancellationError,
  FabricClientError,
  FabricQueryError,
} from "./errors"

/**
 * Configuration for automatic retry behavior.
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts (in addition to the initial call).
   *
   * @default 3
   */
  maxRetries?: number
  /**
   * Initial delay between retries in milliseconds.
   *
   * @default 1000
   */
  initialDelay?: number
  /**
   * Maximum delay between retries in milliseconds.
   *
   * @default 30000
   */
  maxDelay?: number
  /**
   * Multiplier applied to the delay after each attempt (exponential backoff).
   *
   * @default 2
   */
  backoffMultiplier?: number
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30_000,
  backoffMultiplier: 2,
}

/**
 * Transient TDS error numbers reported by SQL Server / Microsoft Fabric.
 *
 * - `4060`: cannot open the requested database
 * - `40197`: the service encountered an error processing the request
 * - `40501`: the service is currently busy
 * - `40613`: the database is not currently available
 * - `49918`: not enough resources to process the request
 * - `49919`: cannot process request, too many operations in progress
 * - `49920`: cannot process request, too many requests
 */
const TRANSIENT_ERROR_NUMBERS = new Set([
  4060, 40_197, 40_501, 40_613, 49_918, 49_919, 49_920,
])

/**
 * Executes an async function, retrying it on transient failures with
 * exponential backoff.
 *
 * Cancellations ({@link FabricCancellationError} and `AbortError`) are never
 * retried. Non-transient errors are re-thrown immediately.
 *
 * @template T - The resolved value type of the wrapped function.
 * @param fn - The operation to execute; invoked once per attempt.
 * @param config - Optional retry tuning; unset fields use the defaults.
 * @returns The value resolved by `fn` on the first successful attempt.
 * @throws {Error} The last error encountered when all attempts fail or the
 *   error is not retryable.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const resolved = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastError: unknown
  let delay = resolved.initialDelay

  for (let attempt = 0; attempt <= resolved.maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn()
    } catch (error) {
      lastError = error
      if (!isRetryable(error) || attempt === resolved.maxRetries) {
        throw error
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay)
      delay = Math.min(delay * resolved.backoffMultiplier, resolved.maxDelay)
    }
  }

  // Unreachable — the loop always returns or throws.
  throw lastError instanceof Error ? lastError : new Error("Retry failed")
}

/**
 * Determines whether an error represents a transient, retryable condition.
 *
 * @param error - The error thrown by the wrapped operation.
 * @returns `true` if the operation is worth retrying.
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof FabricCancellationError) {
    return false
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return false
  }
  if (
    error instanceof FabricQueryError &&
    TRANSIENT_ERROR_NUMBERS.has(error.errorNumber)
  ) {
    return true
  }
  if (error instanceof FabricClientError && error.statusCode !== undefined) {
    return [429, 500, 502, 503, 504].includes(error.statusCode)
  }
  if (
    error instanceof Error &&
    (error.message.includes("ECONNRESET") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("ETIMEDOUT"))
  ) {
    return true
  }
  return false
}

function sleep(ms: number): Promise<void> {
  // eslint-disable-next-line promise/avoid-new
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
