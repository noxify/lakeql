import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"

import { TrinoClientError, TrinoQueryError } from "../src"
import type { QueryResult } from "../src"
import {
  baseStats,
  createClient,
  mockUrl,
  multiPageHandlers,
  singlePageHandlers,
  statementWithDataHandlers,
  State,
} from "./helpers"

const server = setupServer(...singlePageHandlers())

describe("query()", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => server.resetHandlers())

  afterAll(() => server.close())

  test("returns data from a single-page response", async () => {
    server.use(...singlePageHandlers([["a"], ["b"]]))

    const client = createClient()
    const result = await client.query({ sql: "SELECT 1" })

    expect(result).toStrictEqual([["a"], ["b"]])
  })

  test("collects data across multiple pages (follows nextUri)", async () => {
    server.use(...multiPageHandlers())

    const client = createClient()
    const result = await client.query({ sql: "SELECT *" })

    expect(result).toStrictEqual([
      ["page1_row1"],
      ["page1_row2"],
      ["page2_row1"],
      ["page2_row2"],
      ["page3_row1"],
      ["page3_row2"],
    ])
  })

  test("returns empty array when no data in response", async () => {
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
      http.get(`${mockUrl}/v1/statement/q1/1`, () =>
        HttpResponse.json({
          id: "q1",
          infoUri: `${mockUrl}/ui/query.html?q1`,
          stats: { ...baseStats, state: State.FINISHED },
          warnings: [],
        } satisfies QueryResult)
      )
    )

    const client = createClient()
    const result = await client.query({ sql: "SELECT 1" })

    expect(result).toStrictEqual([])
  })

  test("keeps initial statement data and follows nextUri", async () => {
    server.use(...statementWithDataHandlers())

    const client = createClient()
    const result = await client.query({ sql: "SELECT *" })

    expect(result).toStrictEqual([
      ["stmt_row1"],
      ["stmt_row2"],
      ["next_row1"],
      ["next_row2"],
    ])
  })

  test("throws TrinoQueryError when Trino returns an error in response", async () => {
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
      http.get(`${mockUrl}/v1/statement/q1/1`, () =>
        HttpResponse.json({
          id: "q1",
          infoUri: `${mockUrl}/ui/query.html?q1`,
          error: {
            message: "Table not found",
            errorCode: 1,
            errorName: "TABLE_NOT_FOUND",
            errorType: "USER_ERROR",
          },
          stats: { ...baseStats, state: State.FAILED },
          warnings: [],
        } satisfies QueryResult)
      )
    )

    const client = createClient()
    await expect(client.query({ sql: "SELECT *" })).rejects.toThrow(
      TrinoQueryError
    )
  })

  test("throws TrinoClientError on non-2xx HTTP status", async () => {
    server.use(
      http.post(
        `${mockUrl}/v1/statement`,
        () => new HttpResponse(null, { status: 401 })
      )
    )

    const client = createClient({ retry: { maxRetries: 0 } })
    await expect(client.query({ sql: "SELECT 1" })).rejects.toThrow(
      TrinoClientError
    )
  })

  test("passes impersonateAs as X-Trino-User header", async () => {
    let capturedUser: string | null = null

    server.use(
      http.post(`${mockUrl}/v1/statement`, ({ request }) => {
        capturedUser = request.headers.get("x-trino-user")
        return HttpResponse.json({
          id: "q1",
          infoUri: `${mockUrl}/ui/query.html?q1`,
          stats: { ...baseStats, state: State.FINISHED },
          warnings: [],
        } satisfies QueryResult)
      })
    )

    const client = createClient()
    await client.query({ sql: "SELECT 1", impersonateAs: "other_user" })

    expect(capturedUser).toBe("other_user")
  })
})
