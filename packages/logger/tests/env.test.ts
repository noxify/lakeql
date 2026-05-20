/* eslint-disable turbo/no-undeclared-env-vars */
/* eslint-disable no-restricted-properties */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

describe("env", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test("should use default LOG_LEVEL when not provided", async () => {
    delete process.env.LOG_LEVEL
    const { env } = await import("../src/env")
    expect(env.LOG_LEVEL).toBe("warn")
  })

  test("should use provided LOG_LEVEL when valid", async () => {
    process.env.LOG_LEVEL = "debug"
    const { env } = await import("../src/env")
    expect(env.LOG_LEVEL).toBe("debug")
  })

  test("should use default NODE_ENV when not provided", async () => {
    delete process.env.NODE_ENV
    const { env } = await import("../src/env")
    expect(env.NODE_ENV).toBe("development")
  })

  test("should use provided NODE_ENV when valid", async () => {
    process.env.NODE_ENV = "production"
    const { env } = await import("../src/env")
    expect(env.NODE_ENV).toBe("production")
  })
})
