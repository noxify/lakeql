import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"

import type { QueryResult } from "../src"
import { baseStats, createClient, mockUrl, State } from "./helpers"

function convenienceHandlers(data: unknown[][]) {
  return [
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
            name: "result",
            type: "varchar",
            typeSignature: { rawType: "varchar", arguments: [] },
          },
        ],
        data,
        stats: { ...baseStats, state: State.FINISHED },
        warnings: [],
      } satisfies QueryResult)
    ),
  ]
}

const server = setupServer(...convenienceHandlers([["item1"], ["item2"]]))

describe("convenience methods", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => server.resetHandlers())

  afterAll(() => server.close())

  test("schemas() returns flat string array", async () => {
    server.use(...convenienceHandlers([["public"], ["information_schema"]]))

    const client = createClient()
    const result = await client.schemas({ catalog: "hive" })

    expect(result).toStrictEqual(["public", "information_schema"])
  })

  test("tables() returns flat string array", async () => {
    server.use(...convenienceHandlers([["users"], ["orders"]]))

    const client = createClient()
    const result = await client.tables({ catalog: "hive", schema: "public" })

    expect(result).toStrictEqual(["users", "orders"])
  })

  test("views() returns flat string array", async () => {
    server.use(...convenienceHandlers([["active_users"], ["daily_report"]]))

    const client = createClient()
    const result = await client.views({ catalog: "hive", schema: "public" })

    expect(result).toStrictEqual(["active_users", "daily_report"])
  })

  test("columns() returns array of tuples", async () => {
    server.use(
      ...convenienceHandlers([
        ["id", "bigint", "", "Primary key"],
        ["name", "varchar", "", "User name"],
      ])
    )

    const client = createClient()
    const result = await client.columns({
      catalog: "hive",
      schema: "public",
      table: "users",
    })

    expect(result).toStrictEqual([
      ["id", "bigint", "", "Primary key"],
      ["name", "varchar", "", "User name"],
    ])
  })

  test("columns() with asObject=true returns typed objects", async () => {
    server.use(
      ...convenienceHandlers([
        ["id", "bigint", "", "Primary key"],
        ["name", "varchar", "", "User name"],
      ])
    )

    const client = createClient()
    const result = await client.columns({
      catalog: "hive",
      schema: "public",
      table: "users",
      asObject: true,
    })

    expect(result).toStrictEqual([
      {
        name: "id",
        type: "bigint",
        extra: "",
        description: "Primary key",
      },
      {
        name: "name",
        type: "varchar",
        extra: "",
        description: "User name",
      },
    ])
  })

  test("columns() with asObject=false returns tuples", async () => {
    server.use(
      ...convenienceHandlers([
        ["id", "bigint", "", "Primary key"],
        ["name", "varchar", "", "User name"],
      ])
    )

    const client = createClient()
    const result = await client.columns({
      catalog: "hive",
      schema: "public",
      table: "users",
      asObject: false,
    })

    expect(result).toStrictEqual([
      ["id", "bigint", "", "Primary key"],
      ["name", "varchar", "", "User name"],
    ])
  })

  test("columns() with asObject undefined returns tuples", async () => {
    server.use(
      ...convenienceHandlers([
        ["id", "bigint", "", "Primary key"],
        ["name", "varchar", "", "User name"],
      ])
    )

    const client = createClient()
    const result = await client.columns({
      catalog: "hive",
      schema: "public",
      table: "users",
      asObject: undefined,
    })

    expect(result).toStrictEqual([
      ["id", "bigint", "", "Primary key"],
      ["name", "varchar", "", "User name"],
    ])
  })
})
