// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable import/first
import { describe, expect, it, vi } from "vitest"

// Mock the Yoga layer so the server builds without loading a real schema.
// serveYoga returns a middleware that answers any GraphQL route with 200.
const { mockCreateYogaServer } = vi.hoisted(() => ({
  mockCreateYogaServer: vi.fn().mockResolvedValue({
    fetch: vi.fn(),
    graphqlEndpoint: "/graphql",
  }),
}))

vi.mock(import("../src/yoga"), () => ({
  createYogaServer: mockCreateYogaServer,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serveYoga: () => (c: any) => c.text("graphql-ok"),
}))

import { createApiServer } from "../src/server"

describe(createApiServer, () => {
  it("answers the health check endpoint with 200", async () => {
    const { app } = await createApiServer()
    const res = await app.request("/live")
    expect(res.status).toBe(200)
  })

  it("honors a custom health check endpoint", async () => {
    const { app } = await createApiServer({ healthCheckEndpoint: "/healthz" })
    const res = await app.request("/healthz")
    expect(res.status).toBe(200)
  })

  it("routes the bare graphql path to Yoga", async () => {
    const { app } = await createApiServer()
    const res = await app.request("/graphql", { method: "POST" })
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe("graphql-ok")
  })

  it("does not set CORS headers when cors is not configured", async () => {
    const { app } = await createApiServer()
    const res = await app.request("/graphql", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    })
    expect(res.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("applies the configured CORS origin", async () => {
    const { app } = await createApiServer({
      cors: { origin: "https://app.example.com" },
    })
    const res = await app.request("/graphql", {
      method: "OPTIONS",
      headers: { origin: "https://app.example.com" },
    })
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://app.example.com"
    )
  })
})
