import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely"
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { Mock } from "vitest"
import { describe, expect, test, vi } from "vitest"

import { initDb } from "../src/db"

const mocks = vi.hoisted(() => ({
  DummyDriver: vi.fn<() => void>(),
  Kysely: vi.fn<() => void>(),
  PostgresAdapter: vi.fn<() => void>(),
  PostgresIntrospector: vi.fn<() => void>(),
  PostgresQueryCompiler: vi.fn<() => void>(),
}))

// Mock Kysely and its components
vi.mock(import("kysely"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    DummyDriver: mocks.DummyDriver as unknown as typeof actual.DummyDriver,
    Kysely: mocks.Kysely as unknown as typeof actual.Kysely,
    PostgresAdapter:
      mocks.PostgresAdapter as unknown as typeof actual.PostgresAdapter,
    PostgresIntrospector:
      mocks.PostgresIntrospector as unknown as typeof actual.PostgresIntrospector,
    PostgresQueryCompiler:
      mocks.PostgresQueryCompiler as unknown as typeof actual.PostgresQueryCompiler,
  }
})

describe("Database Initialization", () => {
  test("initDb should create a Kysely instance with correct configuration", () => {
    // Call the function
    initDb<{ test: { id: number } }>()

    // Verify Kysely was constructed with the correct dialect configuration
    expect(Kysely).toHaveBeenCalledWith({
      dialect: {
        createAdapter: expect.any(Function),
        createDriver: expect.any(Function),
        createIntrospector: expect.any(Function),
        createQueryCompiler: expect.any(Function),
      },
    })

    // Get the dialect object passed to Kysely
    // @ts-expect-error ignore could be undefined
    const dialectArg = (Kysely as unknown as Mock).mock.calls[0][0].dialect

    // Test each function in the dialect object
    dialectArg.createAdapter()
    expect(PostgresAdapter).toHaveBeenCalledWith()

    dialectArg.createDriver()
    expect(DummyDriver).toHaveBeenCalledWith()

    // For createIntrospector, we need to pass a db parameter
    const mockDb = {}
    dialectArg.createIntrospector(mockDb)
    expect(PostgresIntrospector).toHaveBeenCalledWith(mockDb)

    dialectArg.createQueryCompiler()
    expect(PostgresQueryCompiler).toHaveBeenCalledWith()
  })
})
