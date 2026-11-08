import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { TrinoClient } from "../src"
import type { TrinoClientProps } from "../src"
import { createClient, singlePageHandlers } from "./helpers"

const server = setupServer(...singlePageHandlers())

describe("Headers", () => {
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }))
  afterEach(() => server.resetHandlers())

  afterAll(() => server.close())

  it("constructor sets basic auth header", () => {
    const client = createClient({
      auth: { type: "basic", username: "user", password: "pass" },
    })
    const headers = client.getHeaders()
    expect(headers["authorization"]).toBe(`Basic ${btoa("user:pass")}`)
  })

  it("constructor sets bearer auth header", () => {
    const client = createClient({
      auth: { type: "bearer", token: "my-jwt-token" },
    })
    const headers = client.getHeaders()
    expect(headers["authorization"]).toBe("Bearer my-jwt-token")
  })

  it("constructor sets X-Trino-Source header", () => {
    const client = createClient({ source: "my-app" })
    const headers = client.getHeaders()
    expect(headers["x-trino-source"]).toBe("my-app")
  })

  it("constructor sets X-Trino-Catalog header", () => {
    const client = createClient({ catalog: "my_catalog" })
    const headers = client.getHeaders()
    expect(headers["x-trino-catalog"]).toBe("my_catalog")
  })

  it("constructor sets X-Trino-Schema header", () => {
    const client = createClient({ schema: "my_schema" })
    const headers = client.getHeaders()
    expect(headers["x-trino-schema"]).toBe("my_schema")
  })

  it("default source is 'nodejs' when not provided", () => {
    const client = createClient()
    const headers = client.getHeaders()
    expect(headers["x-trino-source"]).toBe("nodejs")
  })

  it("schema header is omitted when not provided", () => {
    const config: TrinoClientProps = {
      auth: { type: "basic", username: "u", password: "p" },
      host: "http://localhost",
      port: 8080,
      catalog: "cat",
    }
    const client = new TrinoClient(config)
    const headers = client.getHeaders()
    expect(headers["x-trino-schema"]).toBeUndefined()
  })

  it("setHeader() sets well-known headers", () => {
    const client = createClient()
    client.setHeader("X-Trino-Time-Zone", "UTC")
    const headers = client.getHeaders()
    expect(headers["x-trino-time-zone"]).toBe("UTC")
  })

  it("setRawHeader() sets arbitrary headers", () => {
    const client = createClient()
    client.setRawHeader("X-Custom-Header", "custom-value")
    const headers = client.getHeaders()
    expect(headers["x-custom-header"]).toBe("custom-value")
  })

  it("getHeaders() returns all headers as object", () => {
    const client = createClient({
      auth: { type: "basic", username: "vitest", password: "vitest" },
      catalog: "cat",
      schema: "sch",
      source: "src",
    })
    const headers = client.getHeaders()

    expect(headers).toStrictEqual({
      authorization: `Basic ${btoa("vitest:vitest")}`,
      "x-trino-catalog": "cat",
      "x-trino-schema": "sch",
      "x-trino-source": "src",
    })
  })
})
