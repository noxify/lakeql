import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"

import type { Column, QueryResult } from "../src"
import {
  baseStats,
  createClient,
  mockUrl,
  singlePageHandlers,
  State,
} from "./helpers"

const server = setupServer(...singlePageHandlers())

describe("transform option", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => server.resetHandlers())

  afterAll(() => server.close())

  test("query() applies transform to each row", async () => {
    server.use(
      ...singlePageHandlers([
        ["alice", 30],
        ["bob", 25],
      ])
    )

    const client = createClient()
    const result = await client.query({
      sql: "SELECT name, age",
      transform: (row) => ({
        name: (row as unknown[])[0] as string,
        age: (row as unknown[])[1] as number,
      }),
    })

    expect(result).toStrictEqual([
      { name: "alice", age: 30 },
      { name: "bob", age: 25 },
    ])
  })

  test("stream() applies transform to each yielded row", async () => {
    server.use(...singlePageHandlers([["x"], ["y"]]))

    const client = createClient()
    const stream = await client.stream({
      sql: "SELECT val",
      transform: (row) => ({ value: (row as string[])[0] }),
    })
    const results: unknown[] = []

    for await (const row of stream) {
      results.push(row)
    }

    expect(results).toStrictEqual([{ value: "x" }, { value: "y" }])
  })

  test("transform receives columns as second argument", async () => {
    const receivedColumns: Column[][] = []

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
          columns: [
            {
              name: "name",
              type: "varchar",
              typeSignature: { rawType: "varchar", arguments: [] },
            },
            {
              name: "age",
              type: "integer",
              typeSignature: { rawType: "integer", arguments: [] },
            },
          ],
          data: [
            ["alice", 30],
            ["bob", 25],
          ],
          stats: { ...baseStats, state: State.FINISHED },
          warnings: [],
        } satisfies QueryResult)
      )
    )

    const client = createClient()
    await client.query({
      sql: "SELECT name, age",
      transform: (row, columns) => {
        receivedColumns.push(columns)
        return row
      },
    })

    expect(receivedColumns).toHaveLength(2)
    expect(receivedColumns[0]).toStrictEqual([
      {
        name: "name",
        type: "varchar",
        typeSignature: { rawType: "varchar", arguments: [] },
      },
      {
        name: "age",
        type: "integer",
        typeSignature: { rawType: "integer", arguments: [] },
      },
    ])
  })

  test("works without transform (returns raw arrays)", async () => {
    server.use(...singlePageHandlers([["raw1"], ["raw2"]]))

    const client = createClient()
    const result = await client.query({ sql: "SELECT 1" })

    expect(result).toStrictEqual([["raw1"], ["raw2"]])
  })
})
