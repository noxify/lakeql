import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  createClient,
  multiPageHandlers,
  singlePageHandlers,
  statementWithDataHandlers,
} from "./helpers"

const server = setupServer(...singlePageHandlers())

describe("stream()", () => {
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }))
  afterEach(() => server.resetHandlers())

  afterAll(() => server.close())

  it("yields all rows from single-page result", async () => {
    server.use(...singlePageHandlers([["x"], ["y"]]))

    const client = createClient()
    const stream = await client.stream({ sql: "SELECT 1" })
    const results: unknown[] = []

    for await (const row of stream) {
      results.push(row)
    }

    expect(results).toStrictEqual([["x"], ["y"]])
  })

  it("yields all rows across multiple pages", async () => {
    server.use(...multiPageHandlers())

    const client = createClient()
    const stream = await client.stream({ sql: "SELECT *" })
    const results: unknown[] = []

    for await (const row of stream) {
      results.push(row)
    }

    expect(results).toStrictEqual([
      ["page1_row1"],
      ["page1_row2"],
      ["page2_row1"],
      ["page2_row2"],
      ["page3_row1"],
      ["page3_row2"],
    ])
  })

  it("keeps initial statement data before following nextUri", async () => {
    server.use(...statementWithDataHandlers())

    const client = createClient()
    const stream = await client.stream({ sql: "SELECT *" })
    const results: unknown[] = []

    for await (const row of stream) {
      results.push(row)
    }

    expect(results).toStrictEqual([
      ["stmt_row1"],
      ["stmt_row2"],
      ["next_row1"],
      ["next_row2"],
    ])
  })

  it("yields transformed rows when transform is provided", async () => {
    server.use(...singlePageHandlers([["alice"], ["bob"]]))

    const client = createClient()
    const stream = await client.stream({
      sql: "SELECT name",
      transform: (row) => ({ name: (row as string[])[0] }),
    })
    const results: unknown[] = []

    for await (const row of stream) {
      results.push(row)
    }

    expect(results).toStrictEqual([{ name: "alice" }, { name: "bob" }])
  })
})
