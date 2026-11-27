import type { DataSource } from "@lakeql/datasource"
import type {
  Serializer,
  StorageOperations,
  TableManager,
} from "@lakeql/storage"
import { createStorageOperations } from "@lakeql/storage"
import type { Files } from "files-sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createHiveTableManager } from "../src/hive-table-manager"
import { createTrinoWriteStrategy } from "../src/write-strategy"

// ─── Mock @lakeql/storage ────────────────────────────────────────────────────

const mockStorageOperations: StorageOperations = {
  upload: vi.fn<() => Promise<void>>(),
  deletePrefix: vi.fn<() => Promise<void>>(),
  listPrefix: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
  deleteKeys: vi.fn<() => Promise<void>>(),
}

const mockExecuteWritePipeline = vi.fn<(...args: unknown[]) => Promise<void>>()

vi.mock(import("@lakeql/storage"), async (importOriginal) => {
  // oxlint-disable-next-line typescript/consistent-type-imports
  const actual = await importOriginal<typeof import("@lakeql/storage")>()
  return {
    ...actual,
    createStorageOperations: vi.fn<() => StorageOperations>(
      () => mockStorageOperations
    ),
    executeWritePipeline: (...args: unknown[]) =>
      mockExecuteWritePipeline(...args),
  }
})

// ─── Mock ./hive-table-manager ───────────────────────────────────────────────

const mockTableManager: TableManager = {
  createTable: vi.fn<() => Promise<void>>(),
  dropTable: vi.fn<() => Promise<void>>(),
  recreateTable: vi.fn<() => Promise<void>>(),
  recreateTablePair: vi.fn<() => Promise<void>>(),
  buildExternalLocation: vi.fn<(path: string) => string>(
    (path: string) => `s3a://test-bucket/${path}`
  ),
}

vi.mock(import("../src/hive-table-manager"), () => ({
  createHiveTableManager: vi.fn<() => TableManager>(() => mockTableManager),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockDataSource(): DataSource {
  return {
    adapter: "trino",
    capabilities: { query: true, stream: true, introspection: true, ddl: true },
    query: vi.fn<() => Promise<unknown[]>>(),
    stream: vi.fn<() => Promise<AsyncGenerator<unknown>>>(),
    catalogs: vi.fn<() => Promise<string[]>>(),
    schemas: vi.fn<() => Promise<string[]>>(),
    tables: vi.fn<() => Promise<string[]>>(),
    views: vi.fn<() => Promise<string[]>>(),
    columns: vi.fn<() => Promise<unknown[]>>(),
    createTable: vi.fn<() => Promise<void>>(),
    dropTable: vi.fn<() => Promise<void>>(),
    qualifiedTableName: vi.fn<() => string>(),
    close: vi.fn<() => Promise<void>>(),
  } as unknown as DataSource
}

function createMockFiles(): Files {
  return {
    adapter: {
      name: "s3",
      bucket: "test-bucket",
    },
  } as unknown as Files
}

function createMockSerializer(): Serializer {
  return {
    serialize: vi
      .fn<
        () => Promise<{
          buffer: Uint8Array
          extension: string
          contentType: string
        }>
      >()
      .mockResolvedValue({
        buffer: new Uint8Array([1, 2, 3]),
        extension: "parquet",
        contentType: "application/vnd.apache.parquet",
      }),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe(createTrinoWriteStrategy, () => {
  let mockDataSource: DataSource
  let mockFiles: Files
  let mockSerializer: Serializer

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecuteWritePipeline.mockResolvedValue()
    mockDataSource = createMockDataSource()
    mockFiles = createMockFiles()
    mockSerializer = createMockSerializer()
  })

  describe("factory construction", () => {
    it("constructs StorageOperations from files", () => {
      createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      expect(createStorageOperations).toHaveBeenCalledWith(mockFiles)
    })

    it("constructs HiveTableManager from dataSource and files", () => {
      createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      expect(createHiveTableManager).toHaveBeenCalledWith({
        dataSource: mockDataSource,
        files: mockFiles,
        externalLocationPrefix: undefined,
        keepShadowTables: undefined,
      })
    })

    it("passes externalLocationPrefix to HiveTableManager", () => {
      createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
        externalLocationPrefix:
          "abfss://container@account.dfs.core.windows.net",
      })

      expect(createHiveTableManager).toHaveBeenCalledWith(
        expect.objectContaining({
          externalLocationPrefix:
            "abfss://container@account.dfs.core.windows.net",
        })
      )
    })

    it("passes keepShadowTables to HiveTableManager", () => {
      createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
        keepShadowTables: true,
      })

      expect(createHiveTableManager).toHaveBeenCalledWith(
        expect.objectContaining({
          keepShadowTables: true,
        })
      )
    })

    it("returns a strategy with a write method", () => {
      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      expect(strategy).toBeDefined()
      expect(strategy.write).toBeInstanceOf(Function)
    })
  })

  describe("write delegation to executeWritePipeline", () => {
    it("delegates to executeWritePipeline with correct config", async () => {
      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      const records = [{ id: 1, name: "test" }]
      const schema = {
        type: "object",
        properties: { id: { type: "integer" } },
      }

      await strategy.write({
        records,
        schema,
        config: {
          basePath: "warehouse/analytics/events",
          table: { catalog: "hive", schema: "analytics", tableName: "events" },
        },
      })

      expect(mockExecuteWritePipeline).toHaveBeenCalledExactlyOnceWith({
        records,
        jsonSchema: schema,
        config: {
          loadStrategy: "full_load",
          basePath: "warehouse/analytics/events",
          table: { catalog: "hive", schema: "analytics", tableName: "events" },
          storage: mockStorageOperations,
          tableManager: mockTableManager,
          serializer: mockSerializer,
          partitioning: undefined,
          autoFillFields: undefined,
          keepShadowTables: undefined,
        },
      })
    })

    it("passes loadStrategy from input config", async () => {
      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      await strategy.write({
        records: [{ id: 1 }],
        schema: {},
        config: {
          loadStrategy: "append",
          basePath: "warehouse/events",
          table: { catalog: "hive", schema: "db", tableName: "events" },
        },
      })

      expect(mockExecuteWritePipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            loadStrategy: "append",
          }),
        })
      )
    })

    it("defaults loadStrategy to full_load when not provided", async () => {
      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      await strategy.write({
        records: [{ id: 1 }],
        schema: {},
        config: {
          basePath: "warehouse/events",
          table: { catalog: "hive", schema: "db", tableName: "events" },
        },
      })

      expect(mockExecuteWritePipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            loadStrategy: "full_load",
          }),
        })
      )
    })

    it("passes partitioning through", async () => {
      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      await strategy.write({
        records: [{ id: 1 }],
        schema: {},
        config: {
          basePath: "warehouse/events",
          table: { catalog: "hive", schema: "db", tableName: "events" },
          partitioning: "event_date:year/event_date:month",
        },
      })

      expect(mockExecuteWritePipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            partitioning: "event_date:year/event_date:month",
          }),
        })
      )
    })

    it("forwards autoFillFields verbatim into executeWritePipeline (C4)", async () => {
      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      const autoFillFields = [
        { name: "ingested_at", kind: "write_timestamp" as const },
      ]

      await strategy.write({
        records: [{ id: 1 }],
        schema: {},
        config: {
          basePath: "warehouse/events",
          table: { catalog: "hive", schema: "db", tableName: "events" },
          loadStrategy: "append",
          autoFillFields,
        },
      })

      expect(mockExecuteWritePipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            autoFillFields,
          }),
        })
      )
    })

    it("uses per-call keepShadowTables when provided", async () => {
      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
        keepShadowTables: false,
      })

      await strategy.write({
        records: [{ id: 1 }],
        schema: {},
        config: {
          basePath: "warehouse/events",
          table: { catalog: "hive", schema: "db", tableName: "events" },
          keepShadowTables: true,
        },
      })

      expect(mockExecuteWritePipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            keepShadowTables: true,
          }),
        })
      )
    })

    it("falls back to factory-level keepShadowTables when per-call is undefined", async () => {
      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
        keepShadowTables: true,
      })

      await strategy.write({
        records: [{ id: 1 }],
        schema: {},
        config: {
          basePath: "warehouse/events",
          table: { catalog: "hive", schema: "db", tableName: "events" },
        },
      })

      expect(mockExecuteWritePipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            keepShadowTables: true,
          }),
        })
      )
    })

    it("injects the factory serializer into the pipeline config", async () => {
      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      await strategy.write({
        records: [{ id: 1 }],
        schema: {},
        config: {
          basePath: "warehouse/events",
          table: { catalog: "hive", schema: "db", tableName: "events" },
        },
      })

      expect(mockExecuteWritePipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            serializer: mockSerializer,
          }),
        })
      )
    })

    it("injects constructed StorageOperations into the pipeline config", async () => {
      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      await strategy.write({
        records: [{ id: 1 }],
        schema: {},
        config: {
          basePath: "warehouse/events",
          table: { catalog: "hive", schema: "db", tableName: "events" },
        },
      })

      expect(mockExecuteWritePipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            storage: mockStorageOperations,
          }),
        })
      )
    })

    it("injects constructed TableManager into the pipeline config", async () => {
      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      await strategy.write({
        records: [{ id: 1 }],
        schema: {},
        config: {
          basePath: "warehouse/events",
          table: { catalog: "hive", schema: "db", tableName: "events" },
        },
      })

      expect(mockExecuteWritePipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            tableManager: mockTableManager,
          }),
        })
      )
    })
  })

  describe("error propagation", () => {
    it("propagates errors from executeWritePipeline", async () => {
      const pipelineError = new Error("Upload failed: connection timeout")
      mockExecuteWritePipeline.mockRejectedValue(pipelineError)

      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      await expect(
        strategy.write({
          records: [{ id: 1 }],
          schema: {},
          config: {
            basePath: "warehouse/events",
            table: { catalog: "hive", schema: "db", tableName: "events" },
          },
        })
      ).rejects.toThrow("Upload failed: connection timeout")
    })

    it("propagates WritePipelineError with phase and committed fields intact", async () => {
      const pipelineError = Object.assign(new Error("DDL creation failed"), {
        phase: "ddl",
        committed: false,
      })
      mockExecuteWritePipeline.mockRejectedValue(pipelineError)

      const strategy = createTrinoWriteStrategy({
        files: mockFiles,
        dataSource: mockDataSource,
        serializer: mockSerializer,
      })

      const caught = await strategy
        .write({
          records: [{ id: 1 }],
          schema: {},
          config: {
            basePath: "warehouse/events",
            table: { catalog: "hive", schema: "db", tableName: "events" },
          },
        })
        .catch((error: unknown) => error)

      expect(caught).toBe(pipelineError)
      expect((caught as { phase: string }).phase).toBe("ddl")
      expect((caught as { committed: boolean }).committed).toBeFalsy()
    })
  })
})

function buildStrategy(dataSourceName?: string) {
  return createTrinoWriteStrategy({
    files: createMockFiles(),
    dataSource: createMockDataSource(),
    dataSourceName,
    serializer: createMockSerializer(),
  })
}

describe("createTrinoWriteStrategy - write method check", () => {
  const table = { catalog: "hive", schema: "s", tableName: "t" }

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecuteWritePipeline.mockResolvedValue()
  })

  it("rejects writeMethod insert before any storage call, naming the data source", async () => {
    const strategy = buildStrategy("warehouse")

    await expect(
      strategy.write({
        records: [{ id: 1 }],
        schema: {},
        config: { table, basePath: "p", writeMethod: "insert" },
      })
    ).rejects.toThrow(
      /data source "warehouse" uses the storage write strategy/u
    )

    expect(mockExecuteWritePipeline).not.toHaveBeenCalled()
  })

  it("rejects writeMethod insert without a data source name", async () => {
    await expect(
      buildStrategy().write({
        records: [],
        schema: {},
        config: { table, writeMethod: "insert" },
      })
    ).rejects.toThrow(/this data source uses the storage write strategy/u)
  })

  it("skips the check when writeMethod is absent or storage", async () => {
    const strategy = buildStrategy("warehouse")

    await strategy.write({
      records: [{ id: 1 }],
      schema: {},
      config: { table, basePath: "p" },
    })
    await strategy.write({
      records: [{ id: 1 }],
      schema: {},
      config: { table, basePath: "p", writeMethod: "storage" },
    })

    expect(mockExecuteWritePipeline).toHaveBeenCalledTimes(2)
  })
})
