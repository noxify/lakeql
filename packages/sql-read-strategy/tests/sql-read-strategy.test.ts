import type {
  AdapterName,
  DataSource,
  DataSourceReadInput,
  ResolveAuth,
} from "@lakeql/datasource"
import { DataSourceValidationError } from "@lakeql/datasource"
import { calculatePageInfo } from "@lakeql/helpers/calculate-page-info"
import type {
  ResponseNormalizationInput,
  ResponseNormalizer,
} from "@lakeql/response-transformer"
import { describe, expect, vi, it } from "vitest"

import {
  createSqlReadStrategy,
  SqlReadStrategyConfigurationError,
} from "../src/index"
import { createMockDialect } from "./test-helpers"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADAPTER = "test-adapter"

async function* noopStream() {
  /* yields nothing */
}

function fakeDataSource(adapter: AdapterName): DataSource {
  return {
    adapter,
    capabilities: {
      query: true,
      stream: false,
      metadata: {
        catalogs: false,
        schemas: false,
        tables: false,
        views: false,
        columns: false,
      },
      write: { supported: false, modes: [] },
      ddl: { createTable: false, dropTable: false },
    },
    typeMapper: {
      toPrimitiveType: () => "String",
      toEngineType: (primitiveType) => primitiveType,
    },
    query: () => Promise.resolve([]),
    stream: () => Promise.resolve(noopStream()),
    catalogs: () => Promise.resolve([]),
    schemas: () => Promise.resolve([]),
    tables: () => Promise.resolve([]),
    views: () => Promise.resolve([]),
    columns: () => Promise.resolve([]),
    createTable: () => Promise.resolve(),
    dropTable: () => Promise.resolve(),
    qualifiedTableName: (c) => `${c.catalog}.${c.schema}.${c.tableName}`,
    close: () => Promise.resolve(),
  }
}

function fakeNormalizer(
  adapterName: AdapterName,
  output?: { totalCount: number; data: unknown[] }
): ResponseNormalizer {
  const resolved = output ?? { totalCount: 0, data: [] as unknown[] }
  return {
    adapterName,
    normalize: <T>() => resolved as { totalCount: number; data: T[] },
  }
}

const noopResolveAuth: ResolveAuth = () => Promise.resolve({})

function validInput(adapter = ADAPTER): DataSourceReadInput {
  return {
    sourceConfig: {
      dataSource: "ds",
      adapter,
      catalog: "cat",
      schema: "sch",
      tableName: "tbl",
    },
    selectFields: ["id"],
    filter: {},
    paging: { page: 1, perPage: 10 },
    sorting: [],
    transformFields: {},
    dateFields: [],
    schema: {},
    context: {},
  }
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe(createSqlReadStrategy, () => {
  it("throws when adapter names do not all match", () => {
    expect(() =>
      createSqlReadStrategy({
        dataSource: fakeDataSource("trino"),
        resolveAuth: noopResolveAuth,
        dialect: createMockDialect("fabric"),
        normalizer: fakeNormalizer("trino"),
      })
    ).toThrow(SqlReadStrategyConfigurationError)
  })

  it("error exposes all three mismatched adapter names", () => {
    let caught: unknown
    try {
      createSqlReadStrategy({
        dataSource: fakeDataSource("a"),
        resolveAuth: noopResolveAuth,
        dialect: createMockDialect("b"),
        normalizer: fakeNormalizer("c"),
      })
    } catch (error) {
      caught = error
    }

    const e = caught as SqlReadStrategyConfigurationError
    expect(e).toBeInstanceOf(SqlReadStrategyConfigurationError)
    expect(e.dataSourceAdapter).toBe("a")
    expect(e.dialectAdapter).toBe("b")
    expect(e.normalizerAdapter).toBe("c")
  })

  it("returns a strategy when all adapter names match", () => {
    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
    })

    expect(strategy).toBeDefined()
    expect(strategy.read).toBeTypeOf("function")
  })
})

// ---------------------------------------------------------------------------
// Read-time adapter mismatch
// ---------------------------------------------------------------------------

describe("read-time validation", () => {
  it("rejects when sourceConfig.adapter differs from bound adapter", async () => {
    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
    })

    const input = validInput("wrong-adapter")

    await expect(strategy.read(input)).rejects.toThrow(
      DataSourceValidationError
    )
  })

  it("rejects invalid paging before calling any downstream dependency", async () => {
    let queryCalled = false

    const ds = fakeDataSource(ADAPTER)
    ds.query = () => {
      queryCalled = true
      return Promise.resolve([])
    }

    const strategy = createSqlReadStrategy({
      dataSource: ds,
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
    })

    const input = validInput()
    input.paging = { page: 0, perPage: 10 }

    await expect(strategy.read(input)).rejects.toThrow(
      DataSourceValidationError
    )
    expect(queryCalled).toBeFalsy()
  })

  it("rejects perPage above the default maxPerPage", async () => {
    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
    })

    const input = validInput()
    input.paging = { page: 1, perPage: 10_001 }

    await expect(strategy.read(input)).rejects.toThrow(
      DataSourceValidationError
    )
  })

  it("rejects perPage above a configured maxPerPage", async () => {
    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
      readValidation: { maxPerPage: 100 },
    })

    const input = validInput()
    input.paging = { page: 1, perPage: 101 }

    await expect(strategy.read(input)).rejects.toThrow(
      DataSourceValidationError
    )
  })

  it("applies the injected defaultPerPage when perPage is omitted", async () => {
    const data = [{ id: 1 }]
    const totalCount = 50

    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER, { totalCount, data }),
      defaultPerPage: 25,
    })

    const input = validInput()
    input.paging = { page: 1 }

    const result = await strategy.read(input)

    const expected = calculatePageInfo({ totalCount, page: 1, perPage: 25 })
    expect(result.pageInfo.maxPages).toBe(expected.maxPages)
  })

  it("falls back to the strategy default (100) when no perPage or defaultPerPage is given", async () => {
    const data = [{ id: 1 }]
    const totalCount = 250

    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER, { totalCount, data }),
    })

    const input = validInput()
    input.paging = { page: 1 }

    const result = await strategy.read(input)

    const expected = calculatePageInfo({ totalCount, page: 1, perPage: 100 })
    expect(result.pageInfo.maxPages).toBe(expected.maxPages)
  })

  it("allows perPage equal to the configured maxPerPage", async () => {
    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
      readValidation: { maxPerPage: 100 },
    })

    const input = validInput()
    input.paging = { page: 1, perPage: 100 }

    await expect(strategy.read(input)).resolves.toBeDefined()
  })

  it("warns but does not throw on an unexpected filter shape", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
    })

    const input = validInput()
    input.filter = "not-an-object" as unknown as Record<string, unknown>

    await expect(strategy.read(input)).resolves.toBeDefined()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unexpected filter shape")
    )

    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Orchestration chain
// ---------------------------------------------------------------------------

describe("orchestration", () => {
  it("calls resolveAuth with the correct dataSource name and context", async () => {
    const authCalls: { name: string; context: unknown }[] = []

    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: (name, ctx) => {
        authCalls.push({ name, context: ctx })
        return Promise.resolve({})
      },
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
    })

    const ctx = { user: "test" }
    const input = validInput()
    input.context = ctx

    await strategy.read(input)

    expect(authCalls).toHaveLength(1)
    expect(authCalls[0]?.name).toBe("ds")
    expect(authCalls[0]?.context).toBe(ctx)
  })

  it("passes a non-empty SQL string and resolved auth to dataSource.query", async () => {
    const queryCalls: {
      sql: string
      requestAuth: unknown
      options: unknown
    }[] = []

    const ds = fakeDataSource(ADAPTER)
    ds.query = (props) => {
      queryCalls.push({
        sql: (props as { sql: string }).sql,
        requestAuth: (props as { requestAuth?: unknown }).requestAuth,
        options: (props as { options?: unknown }).options,
      })
      return Promise.resolve([])
    }

    const fixedAuth = { type: "bearer" as const, token: "tok" }
    const fixedOptions = { key: "val" }

    const strategy = createSqlReadStrategy({
      dataSource: ds,
      resolveAuth: () =>
        Promise.resolve({ requestAuth: fixedAuth, options: fixedOptions }),
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
    })

    await strategy.read(validInput())

    expect(queryCalls).toHaveLength(1)
    expect(queryCalls[0]?.sql).toBeTypeOf("string")
    expect(queryCalls[0]?.sql?.length ?? 0).toBeGreaterThan(0)
    expect(queryCalls[0]?.requestAuth).toStrictEqual(fixedAuth)
    expect(queryCalls[0]?.options).toStrictEqual(fixedOptions)
  })

  it("passes raw query rows and input metadata to normalizer", async () => {
    const normCalls: ResponseNormalizationInput[] = []
    const rows = [{ id: 1 }, { id: 2 }]

    const ds = fakeDataSource(ADAPTER)
    ds.query = <TRow>() => Promise.resolve(rows as TRow[])

    const normalizer: ResponseNormalizer = {
      adapterName: ADAPTER,
      normalize: <T>(input: ResponseNormalizationInput) => {
        normCalls.push(input)
        return { totalCount: 2, data: rows as T[] }
      },
    }

    const strategy = createSqlReadStrategy({
      dataSource: ds,
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer,
    })

    const readInput = validInput()
    readInput.selectFields = ["id", "name"]
    readInput.dateFields = ["created"]

    await strategy.read(readInput)

    expect(normCalls).toHaveLength(1)
    expect(normCalls[0]?.response).toBe(rows)
    expect(normCalls[0]?.selectFields).toBe(readInput.selectFields)
    expect(normCalls[0]?.dateFields).toBe(readInput.dateFields)
  })
})

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------

describe("error propagation", () => {
  it("query errors propagate with reference identity", async () => {
    const original = new Error("query boom")
    const ds = fakeDataSource(ADAPTER)
    ds.query = () => Promise.reject(original)

    const strategy = createSqlReadStrategy({
      dataSource: ds,
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
    })

    await expect(strategy.read(validInput())).rejects.toBe(original)
  })

  it("normalizer errors propagate with reference identity", async () => {
    const original = new Error("normalize boom")
    const normalizer: ResponseNormalizer = {
      adapterName: ADAPTER,
      normalize: () => {
        throw original
      },
    }

    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer,
    })

    await expect(strategy.read(validInput())).rejects.toBe(original)
  })

  it("resolveAuth errors propagate with reference identity", async () => {
    const original = new Error("auth boom")

    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: () => Promise.reject(original),
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
    })

    await expect(strategy.read(validInput())).rejects.toBe(original)
  })
})

// ---------------------------------------------------------------------------
// Result construction
// ---------------------------------------------------------------------------

describe("result construction", () => {
  it("maps normalizer output to DataSourceReadResult with correct pageInfo", async () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const totalCount = 25

    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER, { totalCount, data }),
    })

    const page = 2
    const perPage = 10
    const input = validInput()
    input.paging = { page, perPage }
    // Declare the fields in the schema so the schema-aware transformer
    // surfaces them (the transformer only emits schema-declared fields).
    input.schema = { type: "object", properties: { id: { type: "number" } } }

    const result = await strategy.read(input)

    const expected = calculatePageInfo({ totalCount, page, perPage })

    expect(result.nodes).toStrictEqual(data)
    expect(result.totalCount).toBe(totalCount)
    expect(result.pageInfo).toStrictEqual({
      maxPages: expected.maxPages,
      hasNext: expected.hasNext,
      hasPrevious: expected.hasPrevious,
      currentPage: expected.currentPage,
      nextPage: expected.nextPage,
      previousPage: expected.previousPage,
    })
  })

  it("applies schema-aware transformation to normalized records", async () => {
    // Normalizer returns raw keyed records including a field not in the schema.
    const data = [{ id: 1, secret: "drop-me", nested: { keep: "v", junk: 9 } }]

    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER, { totalCount: 1, data }),
    })

    const input = validInput()
    input.schema = {
      type: "object",
      properties: {
        id: { type: "number" },
        nested: {
          type: "object",
          properties: { keep: { type: "string" } },
        },
      },
    }

    const result = await strategy.read(input)

    // "secret" and "nested.junk" are not in the schema → dropped.
    expect(result.nodes).toStrictEqual([{ id: 1, nested: { keep: "v" } }])
  })

  it("empty normalizer output produces empty nodes and zero totalCount", async () => {
    const strategy = createSqlReadStrategy({
      dataSource: fakeDataSource(ADAPTER),
      resolveAuth: noopResolveAuth,
      dialect: createMockDialect(ADAPTER),
      normalizer: fakeNormalizer(ADAPTER),
    })

    const result = await strategy.read(validInput())

    expect(result.nodes).toStrictEqual([])
    expect(result.totalCount).toBe(0)
  })
})
