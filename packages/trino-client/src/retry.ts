import { TrinoCancellationError, TrinoClientError } from "./errors"

/**
 * Configuration for automatic retry behavior.
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts.
   * @default 3
   */
  maxRetries?: number
  /**
   * Initial delay between retries in ms.
   * @default 1000
   */
  initialDelay?: number
  /**
   * Maximum delay between retries in ms.
   * @default 30000
   */
  maxDelay?: number
  /**
   * Multiplier for exponential backoff.
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
 * Executes a function with automatic retry on retryable failures.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const resolved = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastError: Error | undefined
  let delay = resolved.initialDelay

  for (let attempt = 0; attempt <= resolved.maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (!isRetryable(error)) {
        throw error
      }

      if (attempt === resolved.maxRetries) {
        throw error
      }

      // eslint-disable-next-line no-await-in-loop
      await sleep(delay)
      delay = Math.min(delay * resolved.backoffMultiplier, resolved.maxDelay)
    }
  }

  // Unreachable — the loop always returns or throws
  throw lastError ?? new Error("Retry failed")
}

function isRetryable(error: unknown): boolean {
  // Never retry cancellations
  if (error instanceof TrinoCancellationError) {
    return false
  }

  // Never retry abort errors (DOMException with name "AbortError")
  if (error instanceof DOMException && error.name === "AbortError") {
    return false
  }

  // Retry on specific HTTP status codes
  if (error instanceof TrinoClientError && error.statusCode) {
    return [429, 500, 502, 503, 504].includes(error.statusCode)
  }

  // Retry on network errors (fetch throws TypeError on network failure)
  if (error instanceof TypeError) {
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
