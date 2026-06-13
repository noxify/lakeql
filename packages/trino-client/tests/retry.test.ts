import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"

import type { QueryResult } from "../src"
import { TrinoClientError } from "../src"
import { baseStats, createClient, mockUrl, State } from "./helpers"

const server = setupServer()

describe("retry behavior", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    server.resetHandlers()
  })

  afterAll(() => server.close())

  test("retries on 429 status code", async () => {
    let attempts = 0

    server.use(
      http.post(`${mockUrl}/v1/statement`, () => {
        attempts += 1
        if (attempts < 2) {
          return new HttpResponse(null, { status: 429 })
        }
        return HttpResponse.json({
          id: "q1",
          infoUri: `${mockUrl}/ui/query.html?q1`,
          stats: { ...baseStats, state: State.FINISHED },
          data: [["ok"]],
          warnings: [],
        } satisfies QueryResult)
      })
    )

    const client = createClient({ retry: { maxRetries: 3, initialDelay: 100 } })
    const promise = client.query({ sql: "SELECT 1" })

    await vi.advanceTimersByTimeAsync(100)
    const result = await promise

    expect(attempts).toBe(2)
    expect(result).toStrictEqual([["ok"]])
  })

  test("retries on 500, 502, 503, 504 status codes", async () => {
    const statusCodes = [500, 502, 503, 504]

    for (const statusCode of statusCodes) {
      let attempts = 0

      server.use(
        http.post(`${mockUrl}/v1/statement`, () => {
          attempts += 1
          if (attempts < 2) {
            return new HttpResponse(null, { status: statusCode })
          }
          return HttpResponse.json({
            id: "q1",
            infoUri: `${mockUrl}/ui/query.html?q1`,
            stats: { ...baseStats, state: State.FINISHED },
            data: [["ok"]],
            warnings: [],
          } satisfies QueryResult)
        })
      )

      const client = createClient({
        retry: { maxRetries: 3, initialDelay: 100 },
      })
      const promise = client.query({ sql: "SELECT 1" })

      // eslint-disable-next-line no-await-in-loop
      await vi.advanceTimersByTimeAsync(100)
      // eslint-disable-next-line no-await-in-loop
      const result = await promise

      expect(attempts).toBe(2)
      expect(result).toStrictEqual([["ok"]])

      server.resetHandlers()
    }
  })

  test("does NOT retry on 400, 401, 403, 404", async () => {
    const statusCodes = [400, 401, 403, 404]

    for (const statusCode of statusCodes) {
      let attempts = 0

      server.use(
        http.post(`${mockUrl}/v1/statement`, () => {
          attempts += 1
          return new HttpResponse(null, { status: statusCode })
        })
      )

      const client = createClient({
        retry: { maxRetries: 3, initialDelay: 100 },
      })

      // eslint-disable-next-line no-await-in-loop
      await expect(client.query({ sql: "SELECT 1" })).rejects.toThrow(
        TrinoClientError
      )
      expect(attempts).toBe(1)

      server.resetHandlers()
    }
  })

  test("respects maxRetries config (stops after N attempts)", async () => {
    let attempts = 0

    server.use(
      http.post(`${mockUrl}/v1/statement`, () => {
        attempts += 1
        return new HttpResponse(null, { status: 503 })
      })
    )

    const client = createClient({
      retry: { maxRetries: 2, initialDelay: 100 },
    })
    const promise = client.query({ sql: "SELECT 1" })

    // Attach rejection handler immediately to avoid unhandled rejection
    // eslint-disable-next-line vitest/valid-expect
    const assertion = expect(promise).rejects.toThrow(TrinoClientError)

    // Advance past all retry delays
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(200)
    await vi.runAllTimersAsync()

    await assertion
    // 1 initial + 2 retries = 3 total attempts
    expect(attempts).toBe(3)
  })

  test("applies exponential backoff between retries", async () => {
    let attempts = 0
    const timestamps: number[] = []

    server.use(
      http.post(`${mockUrl}/v1/statement`, () => {
        attempts += 1
        timestamps.push(Date.now())
        if (attempts <= 3) {
          return new HttpResponse(null, { status: 503 })
        }
        return HttpResponse.json({
          id: "q1",
          infoUri: `${mockUrl}/ui/query.html?q1`,
          stats: { ...baseStats, state: State.FINISHED },
          data: [["ok"]],
          warnings: [],
        } satisfies QueryResult)
      })
    )

    const client = createClient({
      retry: { maxRetries: 5, initialDelay: 1000, backoffMultiplier: 2 },
    })
    const promise = client.query({ sql: "SELECT 1" })

    // First retry after 1000ms
    await vi.advanceTimersByTimeAsync(1000)
    // Second retry after 2000ms (1000 * 2)
    await vi.advanceTimersByTimeAsync(2000)
    // Third retry after 4000ms (2000 * 2)
    await vi.advanceTimersByTimeAsync(4000)

    await promise

    expect(attempts).toBe(4)
    // Verify increasing delays between attempts
    const delays = timestamps.slice(1).map((t, i) => t - (timestamps[i] ?? 0))
    expect(delays[0]).toBe(1000)
    expect(delays[1]).toBe(2000)
    expect(delays[2]).toBe(4000)
  })

  test("does not retry cancellation errors", async () => {
    let attempts = 0

    server.use(
      http.post(`${mockUrl}/v1/statement`, () => {
        attempts += 1
        return HttpResponse.json({
          id: "q1",
          infoUri: `${mockUrl}/ui/query.html?q1`,
          nextUri: `${mockUrl}/v1/statement/q1/1`,
          stats: baseStats,
          warnings: [],
        } satisfies QueryResult)
      }),
      http.get(
        `${mockUrl}/v1/statement/q1/1`,
        () => new HttpResponse(null, { status: 200 })
      )
    )

    const controller = new AbortController()
    controller.abort("cancelled")

    const client = createClient({
      retry: { maxRetries: 3, initialDelay: 100 },
    })

    await expect(
      client.query({ sql: "SELECT 1", signal: controller.signal })
    ).rejects.toThrow("cancelled")

    // Should not have retried
    expect(attempts).toBeLessThanOrEqual(1)
  })

  test("retries on network errors (TypeError from fetch)", async () => {
    let attempts = 0

    server.use(
      http.post(`${mockUrl}/v1/statement`, () => {
        attempts += 1
        if (attempts < 2) {
          return HttpResponse.error()
        }
        return HttpResponse.json({
          id: "q1",
          infoUri: `${mockUrl}/ui/query.html?q1`,
          stats: { ...baseStats, state: State.FINISHED },
          data: [["ok"]],
          warnings: [],
        } satisfies QueryResult)
      })
    )

    const client = createClient({
      retry: { maxRetries: 3, initialDelay: 100 },
    })
    const promise = client.query({ sql: "SELECT 1" })

    await vi.advanceTimersByTimeAsync(100)
    const result = await promise

    expect(attempts).toBe(2)
    expect(result).toStrictEqual([["ok"]])
  })

  test("default retries is 3", async () => {
    let attempts = 0

    server.use(
      http.post(`${mockUrl}/v1/statement`, () => {
        attempts += 1
        return new HttpResponse(null, { status: 503 })
      })
    )

    // No retry config override — uses defaults
    const client = createClient()
    const promise = client.query({ sql: "SELECT 1" })

    // Attach rejection handler immediately to avoid unhandled rejection
    // eslint-disable-next-line vitest/valid-expect
    const assertion = expect(promise).rejects.toThrow(TrinoClientError)

    // Default initialDelay is 1000, backoff is 2
    await vi.advanceTimersByTimeAsync(1000) // retry 1
    await vi.advanceTimersByTimeAsync(2000) // retry 2
    await vi.advanceTimersByTimeAsync(4000) // retry 3
    await vi.runAllTimersAsync()

    await assertion
    // 1 initial + 3 retries = 4 total
    expect(attempts).toBe(4)
  })
})
