// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable import/first
import { describe, expect, it, vi } from "vitest"

// Capture the `context` factory passed to createYoga so we can invoke it.
const { mockCreateYoga, capturedOptions } = vi.hoisted(() => {
  const captured: { context?: (args: unknown) => Promise<unknown> } = {}
  return {
    capturedOptions: captured,
    mockCreateYoga: vi.fn(
      (options: { context: (args: unknown) => unknown }) => {
        captured.context = options.context as (
          args: unknown
        ) => Promise<unknown>
        return { fetch: vi.fn() }
      }
    ),
  }
})

vi.mock(import("graphql-yoga"), () => ({
  createYoga: mockCreateYoga,
}))

vi.mock(import("../src/schema"), () => ({
  loadSchema: vi.fn(async () => ({})),
}))

vi.mock(import("../src/auth"), () => ({
  tokenResolver: vi.fn(async () => null),
  hasReadPermission: vi.fn(() => true),
  hasWritePermission: vi.fn(() => true),
}))

import type { createLogger } from "@lakeql/logger"

import { createYogaServer } from "../src/yoga"

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as ReturnType<typeof createLogger>

async function buildContext(runtime?: {
  getReadStrategy: (name: string) => unknown
  getWriteStrategy: (name: string) => unknown
}): Promise<{
  getReadStrategy?: (name: string) => unknown
  getWriteStrategy?: (name: string) => unknown
}> {
  await createYogaServer(
    logger,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { runtime } as any
  )
  const { context } = capturedOptions
  if (!context) {
    throw new Error("context factory was not captured")
  }
  return (await context({ request: new Request("http://localhost") })) as {
    getReadStrategy?: (name: string) => unknown
    getWriteStrategy?: (name: string) => unknown
  }
}

describe(createYogaServer, () => {
  it("bridges getReadStrategy and getWriteStrategy from the runtime", async () => {
    const readStrategy = { read: vi.fn() }
    const writeStrategy = { write: vi.fn() }
    const runtime = {
      getReadStrategy: vi.fn(() => readStrategy),
      getWriteStrategy: vi.fn(() => writeStrategy),
    }

    const context = await buildContext(runtime)

    expect(context.getReadStrategy?.("warehouse")).toBe(readStrategy)
    expect(runtime.getReadStrategy).toHaveBeenCalledWith("warehouse")
    expect(context.getWriteStrategy?.("warehouse")).toBe(writeStrategy)
    expect(runtime.getWriteStrategy).toHaveBeenCalledWith("warehouse")
  })

  it("provides a getReadStrategy that throws when there is no runtime", async () => {
    const context = await buildContext()

    expect(context.getReadStrategy).toBeTypeOf("function")
    expect(() => context.getReadStrategy?.("warehouse")).toThrow(
      /without a runtime/u
    )
  })

  it("leaves getWriteStrategy undefined without a runtime", async () => {
    const context = await buildContext()

    expect(context.getWriteStrategy).toBeUndefined()
  })
})
