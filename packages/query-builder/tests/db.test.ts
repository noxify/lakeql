import { DummyDriver, Kysely } from "kysely"
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { Mock } from "vitest"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { QueryDialect } from "../src"
import { initDb } from "../src/db"

const mocks = vi.hoisted(() => ({
  DummyDriver: vi.fn<() => void>(),
  Kysely: vi.fn<() => void>(),
}))

// Mock Kysely
vi.mock(import("kysely"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    DummyDriver: mocks.DummyDriver as unknown as typeof actual.DummyDriver,
    Kysely: mocks.Kysely as unknown as typeof actual.Kysely,
  }
})

const mockAdapter = { name: "mock-adapter" }
const mockCompiler = { name: "mock-compiler" }
const mockIntrospector = { name: "mock-introspector" }

/**
 * Creates a test dialect with mock Kysely components for assertions.
 */
function createTestDialect(): QueryDialect {
  return {
    adapterName: "test",
    createAdapter: vi.fn<
      () => typeof mockAdapter
    >() as unknown as QueryDialect["createAdapter"],
    createQueryCompiler: vi.fn<
      () => typeof mockCompiler
    >() as unknown as QueryDialect["createQueryCompiler"],
    createIntrospector: vi.fn<
      () => typeof mockIntrospector
    >() as unknown as QueryDialect["createIntrospector"],
    toUnixTimestamp: vi.fn<
      () => void
    >() as unknown as QueryDialect["toUnixTimestamp"],
    pagination: vi.fn<() => void>() as unknown as QueryDialect["pagination"],
    trueLiteral: vi.fn<() => void>() as unknown as QueryDialect["trueLiteral"],
    qualifiedTable: vi.fn<
      () => void
    >() as unknown as QueryDialect["qualifiedTable"],
  }
}

/**
 * Invokes `initDb` with a fresh test dialect whose component factories return
 * the shared mock values, and returns the dialect config object passed to the
 * mocked `Kysely` constructor along with the dialect for call assertions.
 */
function initAndGetDialectArg(): {
  dialect: QueryDialect
  dialectArg: {
    createAdapter: () => unknown
    createDriver: () => unknown
    createIntrospector: (db: unknown) => unknown
    createQueryCompiler: () => unknown
  }
} {
  const dialect = createTestDialect()
  ;(dialect.createAdapter as Mock).mockReturnValue(mockAdapter)
  ;(dialect.createQueryCompiler as Mock).mockReturnValue(mockCompiler)
  ;(dialect.createIntrospector as Mock).mockReturnValue(mockIntrospector)

  initDb<{ test: { id: number } }>(dialect)

  // @ts-expect-error mock.calls element could be undefined
  const dialectArg = (Kysely as unknown as Mock).mock.calls[0][0].dialect
  return { dialect, dialectArg }
}

describe("Database Initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("constructs Kysely with a dialect exposing the four factory functions", () => {
    const dialect = createTestDialect()

    initDb<{ test: { id: number } }>(dialect)

    // initDb spreads the QueryDialect and overrides createDriver, so the
    // object also carries the dialect's extra (inert) members. Kysely only
    // reads the four create* factories, which must all be present.
    expect(Kysely).toHaveBeenCalledWith({
      dialect: expect.objectContaining({
        createAdapter: expect.any(Function),
        createDriver: expect.any(Function),
        createIntrospector: expect.any(Function),
        createQueryCompiler: expect.any(Function),
      }),
    })
  })

  it("createAdapter delegates to the dialect and returns its adapter", () => {
    const { dialect, dialectArg } = initAndGetDialectArg()

    const adapter = dialectArg.createAdapter()

    expect(adapter).toBe(mockAdapter)
    expect(dialect.createAdapter).toHaveBeenCalledWith()
  })

  it("createDriver constructs a DummyDriver", () => {
    const { dialectArg } = initAndGetDialectArg()

    dialectArg.createDriver()

    expect(DummyDriver).toHaveBeenCalledWith()
  })

  it("createIntrospector delegates to the dialect with the db argument", () => {
    const { dialect, dialectArg } = initAndGetDialectArg()

    const mockDb = {}
    const introspector = dialectArg.createIntrospector(mockDb)

    expect(introspector).toBe(mockIntrospector)
    expect(dialect.createIntrospector).toHaveBeenCalledWith(mockDb)
  })

  it("createQueryCompiler delegates to the dialect and returns its compiler", () => {
    const { dialect, dialectArg } = initAndGetDialectArg()

    const compiler = dialectArg.createQueryCompiler()

    expect(compiler).toBe(mockCompiler)
    expect(dialect.createQueryCompiler).toHaveBeenCalledWith()
  })
})
