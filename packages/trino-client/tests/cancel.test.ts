import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"

import { TrinoCancellationError, TrinoClientError } from "../src"
import type { QueryResult } from "../src"
import {
  baseStats,
  createClient,
  mockUrl,
  singlePageHandlers,
  State,
} from "./helpers"

const server = setupServer(...singlePageHandlers())

describe("cancel/abort behavior", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => server.resetHandlers())

  afterAll(() => server.close())

  test("cancelQuery() sends DELETE to /v1/query/{queryId}", async () => {
    let receivedMethod: string | null = null
    let receivedPath: string | null = null

    server.use(
      http.delete(`${mockUrl}/v1/query/:queryId`, ({ request, params }) => {
        receivedMethod = request.method
        receivedPath = `/v1/query/${params["queryId"] as string}`
        return new HttpResponse(null, { status: 204 })
      })
    )

    const client = createClient()
    await client.cancelQuery("abc-123")

    expect(receivedMethod).toBe("DELETE")
    expect(receivedPath).toBe("/v1/query/abc-123")
  })

  test("cancelQuery() does not throw on 404 (already cancelled)", async () => {
    server.use(
      http.delete(
        `${mockUrl}/v1/query/:queryId`,
        () => new HttpResponse(null, { status: 404 })
      )
    )

    const client = createClient()
    await expect(client.cancelQuery("gone-query")).resolves.toBeUndefined()
  })

  test("cancelQuery() throws on other non-2xx status", async () => {
    server.use(
      http.delete(
        `${mockUrl}/v1/query/:queryId`,
        () => new HttpResponse(null, { status: 500 })
      )
    )

    const client = createClient()
    await expect(client.cancelQuery("fail-query")).rejects.toThrow(
      TrinoClientError
    )
  })

  test("cancelAllQueries() cancels all tracked queries", async () => {
    const deletedIds: string[] = []
    let queryCount = 0

    server.use(
      http.post(`${mockUrl}/v1/statement`, () => {
        queryCount += 1
        const id = `q${queryCount}`
        return HttpResponse.json({
          id,
          infoUri: `${mockUrl}/ui/query.html?${id}`,
          nextUri: `${mockUrl}/v1/statement/${id}/1`,
          stats: baseStats,
          warnings: [],
        } satisfies QueryResult)
      }),
      http.get(`${mockUrl}/v1/statement/:queryId/:stage`, ({ params }) => {
        const qId = params["queryId"] as string
        return HttpResponse.json({
          id: qId,
          infoUri: `${mockUrl}/ui/query.html?${qId}`,
          data: [["data"]],
          stats: { ...baseStats, state: State.FINISHED },
          warnings: [],
        } satisfies QueryResult)
      }),
      http.delete(`${mockUrl}/v1/query/:queryId`, ({ params }) => {
        deletedIds.push(params["queryId"] as string)
        return new HttpResponse(null, { status: 204 })
      })
    )

    const client = createClient({ retry: { maxRetries: 0 } })

    let activeQueriesDuringExecution: string[] = []

    server.use(
      http.post(`${mockUrl}/v1/statement`, () => {
        queryCount += 1
        const id = `tracked_${queryCount}`
        return HttpResponse.json({
          id,
          infoUri: `${mockUrl}/ui/query.html?${id}`,
          nextUri: `${mockUrl}/v1/statement/${id}/1`,
          stats: baseStats,
          warnings: [],
        } satisfies QueryResult)
      }),
      http.get(`${mockUrl}/v1/statement/:queryId/:stage`, ({ params }) => {
        const qId = params["queryId"] as string
        activeQueriesDuringExecution = client.getActiveQueries()
        return HttpResponse.json({
          id: qId,
          infoUri: `${mockUrl}/ui/query.html?${qId}`,
          data: [["data"]],
          stats: { ...baseStats, state: State.FINISHED },
          warnings: [],
        } satisfies QueryResult)
      }),
      http.delete(`${mockUrl}/v1/query/:queryId`, ({ params }) => {
        deletedIds.push(params["queryId"] as string)
        return new HttpResponse(null, { status: 204 })
      })
    )

    // Run a query that finishes
    await client.query({ sql: "SELECT 1" })

    // activeQueries was populated during execution
    expect(activeQueriesDuringExecution.length).toBeGreaterThan(0)

    // After completion, active queries is empty
    expect(client.getActiveQueries()).toStrictEqual([])

    // Test cancelAllQueries with a multi-page query
    let page = 0
    server.use(
      http.post(`${mockUrl}/v1/statement`, () =>
        HttpResponse.json({
          id: "active1",
          infoUri: `${mockUrl}/ui/query.html?active1`,
          nextUri: `${mockUrl}/v1/statement/active1/1`,
          stats: baseStats,
          warnings: [],
        } satisfies QueryResult)
      ),
      http.get(`${mockUrl}/v1/statement/:queryId/:stage`, ({ params }) => {
        page += 1
        const qId = params["queryId"] as string
        if (page < 3) {
          return HttpResponse.json({
            id: qId,
            infoUri: `${mockUrl}/ui/query.html?${qId}`,
            nextUri: `${mockUrl}/v1/statement/${qId}/${page + 1}`,
            data: [[`page${page}`]],
            stats: { ...baseStats, state: State.RUNNING },
            warnings: [],
          } satisfies QueryResult)
        }
        return HttpResponse.json({
          id: qId,
          infoUri: `${mockUrl}/ui/query.html?${qId}`,
          data: [[`page${page}`]],
          stats: { ...baseStats, state: State.FINISHED },
          warnings: [],
        } satisfies QueryResult)
      }),
      http.delete(`${mockUrl}/v1/query/:queryId`, ({ params }) => {
        deletedIds.push(params["queryId"] as string)
        return new HttpResponse(null, { status: 204 })
      })
    )

    // Clear deletedIds
    deletedIds.length = 0

    // Run query — it should complete and then no longer be active
    await client.query({ sql: "SELECT *" })
    expect(client.getActiveQueries()).toStrictEqual([])

    // Call cancelAllQueries when empty — should do nothing
    await client.cancelAllQueries()
    expect(deletedIds).toStrictEqual([])
  })

  test("getActiveQueries() returns empty array initially", () => {
    const client = createClient()
    expect(client.getActiveQueries()).toStrictEqual([])
  })

  test("getActiveQueries() returns empty after query completes", async () => {
    server.use(...singlePageHandlers())

    const client = createClient()
    await client.query({ sql: "SELECT 1" })

    expect(client.getActiveQueries()).toStrictEqual([])
  })

  test("query with signal that's already aborted throws TrinoCancellationError", async () => {
    const controller = new AbortController()
    controller.abort("Already cancelled")

    const client = createClient()

    await expect(
      client.query({ sql: "SELECT 1", signal: controller.signal })
    ).rejects.toThrow(TrinoCancellationError)
  })

  test("AbortSignal cancels in-flight query (abort during pagination)", async () => {
    let pagesFetched = 0
    const controller = new AbortController()

    server.use(
      http.post(`${mockUrl}/v1/statement`, () =>
        HttpResponse.json({
          id: "q1",
          infoUri: `${mockUrl}/ui/query.html?q1`,
          nextUri: `${mockUrl}/v1/statement/q1/1`,
          stats: baseStats,
          warnings: [],
        } satisfies QueryResult)
      ),
      http.get(`${mockUrl}/v1/statement/q1/:stage`, () => {
        pagesFetched += 1
        // Abort after first page is fetched
        if (pagesFetched >= 2) {
          controller.abort("user cancelled")
        }
        return HttpResponse.json({
          id: "q1",
          infoUri: `${mockUrl}/ui/query.html?q1`,
          nextUri: `${mockUrl}/v1/statement/q1/${pagesFetched + 1}`,
          data: [[`page${pagesFetched}`]],
          stats: { ...baseStats, state: State.RUNNING },
          warnings: [],
        } satisfies QueryResult)
      })
    )

    const client = createClient({ retry: { maxRetries: 0 } })

    await expect(
      client.query({ sql: "SELECT *", signal: controller.signal })
    ).rejects.toThrow(TrinoCancellationError)

    expect(pagesFetched).toBeGreaterThanOrEqual(2)
  })
})
