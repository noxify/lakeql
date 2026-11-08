import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  FabricCancellationError,
  FabricClientError,
  FabricQueryError,
} from "../src/errors"
import { withRetry } from "../src/retry"

type Attempt = () => Promise<string>

/**
 * Settles a withRetry call while advancing fake timers so backoff sleeps
 * resolve without real waiting. Returns the resolved value or, on failure,
 * the thrown error.
 */
async function settle<T>(promise: Promise<T>): Promise<T | unknown> {
  // Attach a no-op handler so the rejection is not reported as unhandled
  // while fake timers advance, then await the real outcome below.
  const guarded = Promise.allSettled([promise])
  await vi.runAllTimersAsync()
  const [result] = await guarded
  return result.status === "fulfilled" ? result.value : result.reason
}

describe(withRetry, () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns the value on first success without retrying", async () => {
    const fn = vi.fn<Attempt>().mockResolvedValue("ok")
    const result = await withRetry(fn)
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledOnce()
  })

  it("retries transient FabricQueryError and eventually succeeds", async () => {
    const fn = vi
      .fn<Attempt>()
      .mockRejectedValueOnce(new FabricQueryError("service busy", 40_501, 1))
      .mockResolvedValue("recovered")

    const result = await settle(withRetry(fn, { initialDelay: 10 }))

    expect(result).toBe("recovered")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("gives up after maxRetries and throws the last error", async () => {
    const error = new FabricQueryError("still busy", 40_501, 1)
    const fn = vi.fn<Attempt>().mockRejectedValue(error)

    const result = await settle(
      withRetry(fn, { maxRetries: 2, initialDelay: 10 })
    )

    expect(result).toBe(error)
    // initial call + 2 retries
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("does not retry a non-transient FabricQueryError", async () => {
    const error = new FabricQueryError("invalid column", 207, 1)
    const fn = vi.fn<Attempt>().mockRejectedValue(error)

    await expect(withRetry(fn)).rejects.toBe(error)
    expect(fn).toHaveBeenCalledOnce()
  })

  it("does not retry a FabricCancellationError", async () => {
    const error = new FabricCancellationError("cancelled")
    const fn = vi.fn<Attempt>().mockRejectedValue(error)

    await expect(withRetry(fn)).rejects.toBe(error)
    expect(fn).toHaveBeenCalledOnce()
  })

  it("retries FabricClientError with a retryable status code", async () => {
    const fn = vi
      .fn<Attempt>()
      .mockRejectedValueOnce(new FabricClientError("service unavailable", 503))
      .mockResolvedValue("ok")

    const result = await settle(withRetry(fn, { initialDelay: 10 }))

    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("does not retry FabricClientError with a non-retryable status code", async () => {
    const error = new FabricClientError("unauthorized", 401)
    const fn = vi.fn<Attempt>().mockRejectedValue(error)

    await expect(withRetry(fn)).rejects.toBe(error)
    expect(fn).toHaveBeenCalledOnce()
  })

  it("retries connection-reset network errors", async () => {
    const fn = vi
      .fn<Attempt>()
      .mockRejectedValueOnce(new Error("read ECONNRESET"))
      .mockResolvedValue("ok")

    const result = await settle(withRetry(fn, { initialDelay: 10 }))

    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("caps the backoff delay at maxDelay", async () => {
    const error = new FabricQueryError("busy", 40_501, 1)
    const fn = vi.fn<Attempt>().mockRejectedValue(error)

    const result = await settle(
      withRetry(fn, {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 1500,
        backoffMultiplier: 10,
      })
    )

    expect(result).toBe(error)
    expect(fn).toHaveBeenCalledTimes(4)
  })
})
