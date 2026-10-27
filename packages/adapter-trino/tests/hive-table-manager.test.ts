// oxlint-disable vitest/max-expects
import type { DataSource } from "@lakeql/datasource"
import type { ManagedTableDefinition } from "@lakeql/storage"
import type { Files } from "files-sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createHiveTableManager,
  resetAutoDerivationWarning,
} from "../src/hive-table-manager"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockDataSource(): DataSource {
  return {
    adapter: "trino",
    capabilities: { query: true, stream: true, introspection: true, ddl: true },
    query: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    stream: vi.fn<() => Promise<AsyncGenerator<unknown>>>(),
    catalogs: vi.fn<() => Promise<string[]>>(),
    schemas: vi.fn<() => Promise<string[]>>(),
    tables: vi.fn<() => Promise<string[]>>(),
    views: vi.fn<() => Promise<string[]>>(),
    columns: vi.fn<() => Promise<unknown[]>>(),
    createTable: vi.fn<() => Promise<void>>(),
    dropTable: vi.fn<() => Promise<void>>().mockResolvedValue(),
    qualifiedTableName: vi.fn<() => string>(),
    close: vi.fn<() => Promise<void>>(),
  } as unknown as DataSource
}

function createMockFiles(adapterName: string, bucket?: string): Files {
  return {
    adapter: {
      name: adapterName,
      ...(bucket === undefined ? {} : { bucket }),
    },
  } as unknown as Files
}

function createTableDefinition(
  overrides: Partial<ManagedTableDefinition> = {}
): ManagedTableDefinition {
  return {
    catalog: "hive",
    schema: "analytics",
    tableName: "events",
    externalLocation: "s3a://my-bucket/warehouse/events/latest.parquet/",
    columns: [
      { name: "id", type: "VARCHAR" },
      { name: "name", type: "VARCHAR" },
      { name: "created_at", type: "TIMESTAMP" },
    ],
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe(createHiveTableManager, () => {
  let mockDataSource: DataSource

  beforeEach(() => {
    vi.clearAllMocks()
    // The manager emits a one-time auto-derivation warning on first use. Mute
    // it by default so unrelated tests stay quiet; the dedicated warning tests
    // below install their own spy (after resetAutoDerivationWarning) to assert.
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mockDataSource = createMockDataSource()
  })

  // ─── URI Scheme Resolution ───────────────────────────────────────────────

  describe("URI scheme resolution", () => {
    it("uses s3a:// for s3 adapter", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      expect(manager.buildExternalLocation("path/to/data/")).toBe(
        "s3a://my-bucket/path/to/data/"
      )
    })

    it("uses s3a:// for minio adapter", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("minio", "my-bucket"),
      })
      expect(manager.buildExternalLocation("warehouse/events/")).toBe(
        "s3a://my-bucket/warehouse/events/"
      )
    })

    it("uses s3a:// for r2 adapter", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("r2", "my-bucket"),
      })
      expect(manager.buildExternalLocation("data/")).toBe(
        "s3a://my-bucket/data/"
      )
    })

    it("uses s3a:// for wasabi adapter", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("wasabi", "my-bucket"),
      })
      expect(manager.buildExternalLocation("data/")).toBe(
        "s3a://my-bucket/data/"
      )
    })

    it("uses gs:// for gcs adapter", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("gcs", "analytics-bucket"),
      })
      expect(manager.buildExternalLocation("warehouse/")).toBe(
        "gs://analytics-bucket/warehouse/"
      )
    })

    it("uses abfss:// for azure adapter", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("azure", "container-name"),
      })
      expect(manager.buildExternalLocation("data/")).toBe(
        "abfss://container-name/data/"
      )
    })

    it("defaults to s3a:// for unknown adapter names", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("some-unknown-provider", "custom-bucket"),
      })
      expect(manager.buildExternalLocation("files/")).toBe(
        "s3a://custom-bucket/files/"
      )
    })

    it("resolves the scheme case-insensitively", () => {
      const gcsUpper = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("GCS", "analytics-bucket"),
      })
      expect(gcsUpper.buildExternalLocation("warehouse/")).toBe(
        "gs://analytics-bucket/warehouse/"
      )

      const azureMixed = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("Azure", "container"),
      })
      expect(azureMixed.buildExternalLocation("data/")).toBe(
        "abfss://container/data/"
      )
    })
  })

  // ─── one-time auto-derivation warning ────────────────────────────────────

  describe("auto-derivation warning", () => {
    it("warns once on auto-derivation and not again for a second manager", () => {
      resetAutoDerivationWarning()
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "bucket-a"),
      })
      createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("gcs", "bucket-b"),
      })

      expect(warnSpy).toHaveBeenCalledOnce()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("auto-derived external location prefix")
      )

      warnSpy.mockRestore()
    })

    it("does not warn when externalLocationPrefix is provided", () => {
      resetAutoDerivationWarning()
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "bucket"),
        externalLocationPrefix: "hdfs://namenode:8020/datalake",
      })

      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  // ─── externalLocationPrefix Override ─────────────────────────────────────

  describe("externalLocationPrefix override", () => {
    it("uses externalLocationPrefix verbatim when provided", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("azure", "container"),
        externalLocationPrefix:
          "abfss://analytics@mystorageaccount.dfs.core.windows.net",
      })
      expect(manager.buildExternalLocation("warehouse/events/")).toBe(
        "abfss://analytics@mystorageaccount.dfs.core.windows.net/warehouse/events/"
      )
    })

    it("ignores adapter name and bucket when prefix is provided", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "ignored-bucket"),
        externalLocationPrefix: "hdfs://namenode:8020/datalake",
      })
      expect(manager.buildExternalLocation("path/")).toBe(
        "hdfs://namenode:8020/datalake/path/"
      )
    })

    it("does not require bucket when prefix is provided", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("azure"),
        externalLocationPrefix:
          "abfss://container@account.dfs.core.windows.net",
      })
      expect(manager.buildExternalLocation("data/")).toBe(
        "abfss://container@account.dfs.core.windows.net/data/"
      )
    })
  })

  // ─── Error: Bucket Unavailable ───────────────────────────────────────────

  describe("error when bucket unavailable", () => {
    it("throws when adapter has no bucket and no externalLocationPrefix", () => {
      expect(() =>
        createHiveTableManager({
          dataSource: mockDataSource,
          files: createMockFiles("s3"),
        })
      ).toThrow("cannot resolve bucket")
    })

    it("includes the adapter name in the error message", () => {
      expect(() =>
        createHiveTableManager({
          dataSource: mockDataSource,
          files: createMockFiles("custom-adapter"),
        })
      ).toThrow("custom-adapter")
    })

    it("suggests externalLocationPrefix in the error message", () => {
      expect(() =>
        createHiveTableManager({
          dataSource: mockDataSource,
          files: createMockFiles("azure"),
        })
      ).toThrow("externalLocationPrefix")
    })
  })

  // ─── createTable DDL ─────────────────────────────────────────────────────

  describe("createTable", () => {
    it("generates CREATE TABLE IF NOT EXISTS with quoted identifiers and PARQUET format", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      await manager.createTable(createTableDefinition())

      expect(mockDataSource.query).toHaveBeenCalledWith({
        sql: expect.stringContaining("CREATE TABLE IF NOT EXISTS"),
      })
      expect(mockDataSource.query).toHaveBeenCalledWith({
        sql: expect.stringContaining('"hive"."analytics"."events"'),
      })
      expect(mockDataSource.query).toHaveBeenCalledWith({
        sql: expect.stringContaining("format = 'PARQUET'"),
      })
    })

    it("includes all column definitions with quoted names in DDL", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      await manager.createTable(createTableDefinition())

      const [call] = vi.mocked(mockDataSource.query).mock.calls
      expect(call?.[0].sql).toContain('"id" VARCHAR')
      expect(call?.[0].sql).toContain('"name" VARCHAR')
      expect(call?.[0].sql).toContain('"created_at" TIMESTAMP')
    })

    it("includes escaped external_location in DDL", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      await manager.createTable(
        createTableDefinition({
          externalLocation: "s3a://my-bucket/warehouse/events/latest.parquet/",
        })
      )

      expect(mockDataSource.query).toHaveBeenCalledWith({
        sql: expect.stringContaining(
          "s3a://my-bucket/warehouse/events/latest.parquet/"
        ),
      })
    })

    it("rejects a column type that tries to break out of the type position", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })

      // A hostile `type` string: close the column list and inject a WITH clause.
      // It must never reach the data source as DDL.
      await expect(
        manager.createTable(
          createTableDefinition({
            columns: [
              { name: "id", type: "VARCHAR) WITH (external_location='x'" },
            ],
          })
        )
      ).rejects.toThrow("Unsupported characters in column type")

      expect(mockDataSource.query).not.toHaveBeenCalled()
    })

    it("allows composite column types (ARRAY, ROW)", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })

      await manager.createTable(
        createTableDefinition({
          columns: [
            { name: "tags", type: "ARRAY(VARCHAR)" },
            { name: "meta", type: "ROW(id BIGINT, label VARCHAR)" },
          ],
        })
      )

      const [call] = vi.mocked(mockDataSource.query).mock.calls
      expect(call?.[0].sql).toContain('"tags" ARRAY(VARCHAR)')
      expect(call?.[0].sql).toContain('"meta" ROW(id BIGINT, label VARCHAR)')
    })
  })

  // ─── dropTable ───────────────────────────────────────────────────────────

  describe("dropTable", () => {
    it("delegates to dataSource.dropTable", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      await manager.dropTable("hive", "analytics", "events")

      expect(mockDataSource.dropTable).toHaveBeenCalledWith(
        "hive",
        "analytics",
        "events"
      )
    })
  })

  // ─── recreateTable (Shadow-Table Pattern) ────────────────────────────────

  describe("recreateTable", () => {
    it("creates a shadow table, drops the original, creates the new table, then drops the shadow", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      await manager.recreateTable(createTableDefinition())

      const queryCalls = vi.mocked(mockDataSource.query).mock.calls
      const dropCalls = vi.mocked(mockDataSource.dropTable).mock.calls

      // Step 0: Drop pre-existing shadow
      expect(dropCalls[0]).toStrictEqual([
        "hive",
        "analytics",
        "events__shadow",
      ])

      // Step 1: Create shadow table (CREATE TABLE without IF NOT EXISTS)
      expect(queryCalls[0]?.[0].sql).toContain('"events__shadow"')
      expect(queryCalls[0]?.[0].sql).not.toContain("IF NOT EXISTS")

      // Step 2: Drop original table
      expect(dropCalls[1]).toStrictEqual(["hive", "analytics", "events"])

      // Step 3: Create new table (strict)
      expect(queryCalls[1]?.[0].sql).toContain('"events"')
      expect(queryCalls[1]?.[0].sql).not.toContain("IF NOT EXISTS")

      // Step 4: Drop shadow (cleanup)
      expect(dropCalls[2]).toStrictEqual([
        "hive",
        "analytics",
        "events__shadow",
      ])
    })

    it("propagates DDL error when shadow table creation fails", async () => {
      vi.mocked(mockDataSource.dropTable).mockResolvedValue()
      vi.mocked(mockDataSource.query).mockRejectedValueOnce(
        new Error("Column type mismatch")
      )

      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      await expect(
        manager.recreateTable(createTableDefinition())
      ).rejects.toThrow("DDL validation error")
    })

    it("includes the table name in DDL validation errors", async () => {
      vi.mocked(mockDataSource.dropTable).mockResolvedValue()
      vi.mocked(mockDataSource.query).mockRejectedValueOnce(
        new Error("Syntax error")
      )

      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      await expect(
        manager.recreateTable(createTableDefinition())
      ).rejects.toThrow("hive.analytics.events")
    })

    it("cleans up shadow table if dropping the original fails", async () => {
      // Shadow drop succeeds (step 0), shadow create succeeds, original drop fails
      vi.mocked(mockDataSource.dropTable)
        .mockResolvedValueOnce() // drop pre-existing shadow
        .mockRejectedValueOnce(new Error("Permission denied")) // drop original fails

      vi.mocked(mockDataSource.query).mockResolvedValueOnce([]) // create shadow

      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      await expect(
        manager.recreateTable(createTableDefinition())
      ).rejects.toThrow("could not drop original table")

      // Should attempt to clean up the shadow after failure
      const dropCalls = vi.mocked(mockDataSource.dropTable).mock.calls
      expect(dropCalls[2]).toStrictEqual([
        "hive",
        "analytics",
        "events__shadow",
      ])
    })

    it("includes recovery info when final creation fails after original was dropped", async () => {
      vi.mocked(mockDataSource.dropTable)
        .mockResolvedValueOnce() // drop pre-existing shadow
        .mockResolvedValueOnce() // drop original

      vi.mocked(mockDataSource.query)
        .mockResolvedValueOnce([]) // create shadow succeeds
        .mockRejectedValueOnce(new Error("Out of resources")) // create real fails

      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      await expect(
        manager.recreateTable(createTableDefinition())
      ).rejects.toThrow("Shadow table")
    })

    it("retains shadow tables when keepShadowTables is true", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
        keepShadowTables: true,
      })
      await manager.recreateTable(createTableDefinition())

      const dropCalls = vi.mocked(mockDataSource.dropTable).mock.calls

      // With keepShadowTables: no pre-existing shadow drop (step 0) and no final cleanup (step 4)
      // Only the original table drop happens
      expect(dropCalls).toHaveLength(1)
      expect(dropCalls[0]).toStrictEqual(["hive", "analytics", "events"])
    })

    it("per-call keepShadowTables:true overrides a false config default", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
        keepShadowTables: false,
      })
      await manager.recreateTable(createTableDefinition(), {
        keepShadowTables: true,
      })

      const dropCalls = vi.mocked(mockDataSource.dropTable).mock.calls

      // Per-call true → only the original drop happens (no shadow pre-drop/cleanup)
      expect(dropCalls).toHaveLength(1)
      expect(dropCalls[0]).toStrictEqual(["hive", "analytics", "events"])
    })

    it("per-call keepShadowTables:false overrides a true config default", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
        keepShadowTables: true,
      })
      await manager.recreateTable(createTableDefinition(), {
        keepShadowTables: false,
      })

      const dropCalls = vi.mocked(mockDataSource.dropTable).mock.calls

      // Per-call false → pre-existing shadow drop (step 0), original drop, and
      // final shadow cleanup (step 4) → 3 drops.
      expect(dropCalls).toHaveLength(3)
      expect(dropCalls[0]).toStrictEqual([
        "hive",
        "analytics",
        "events__shadow",
      ])
      expect(dropCalls[1]).toStrictEqual(["hive", "analytics", "events"])
      expect(dropCalls[2]).toStrictEqual([
        "hive",
        "analytics",
        "events__shadow",
      ])
    })

    it("falls back to config default when no per-call option is given", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
        keepShadowTables: true,
      })
      await manager.recreateTable(createTableDefinition(), {})

      const dropCalls = vi.mocked(mockDataSource.dropTable).mock.calls
      // Config true still applies → only original drop
      expect(dropCalls).toHaveLength(1)
    })
  })

  // ─── recreateTablePair ───────────────────────────────────────────────────

  describe("recreateTablePair", () => {
    it("creates shadows for both tables, drops both originals, creates both real tables, then cleans up shadows", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      const latestDef = createTableDefinition({ tableName: "events_latest" })
      const allDef = createTableDefinition({ tableName: "events_all" })

      await manager.recreateTablePair(latestDef, allDef)

      const queryCalls = vi.mocked(mockDataSource.query).mock.calls
      const dropCalls = vi.mocked(mockDataSource.dropTable).mock.calls

      // Phase 0: Drop pre-existing shadows
      expect(dropCalls[0]).toStrictEqual([
        "hive",
        "analytics",
        "events_latest__shadow",
      ])
      expect(dropCalls[1]).toStrictEqual([
        "hive",
        "analytics",
        "events_all__shadow",
      ])

      // Phase 1: Create shadow tables
      expect(queryCalls[0]?.[0].sql).toContain('"events_latest__shadow"')
      expect(queryCalls[1]?.[0].sql).toContain('"events_all__shadow"')

      // Phase 2: Drop originals (best-effort via dropTableSafe)
      expect(dropCalls[2]).toStrictEqual(["hive", "analytics", "events_latest"])
      expect(dropCalls[3]).toStrictEqual(["hive", "analytics", "events_all"])

      // Phase 3: Create real tables
      expect(queryCalls[2]?.[0].sql).toContain('"events_latest"')
      expect(queryCalls[2]?.[0].sql).not.toContain("__shadow")
      expect(queryCalls[3]?.[0].sql).toContain('"events_all"')
      expect(queryCalls[3]?.[0].sql).not.toContain("__shadow")

      // Phase 4: Drop shadows (cleanup)
      expect(dropCalls[4]).toStrictEqual([
        "hive",
        "analytics",
        "events_latest__shadow",
      ])
      expect(dropCalls[5]).toStrictEqual([
        "hive",
        "analytics",
        "events_all__shadow",
      ])
    })

    it("propagates error when latest shadow DDL fails", async () => {
      vi.mocked(mockDataSource.dropTable).mockResolvedValue()
      vi.mocked(mockDataSource.query).mockRejectedValueOnce(
        new Error("Invalid column")
      )

      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      const latestDef = createTableDefinition({ tableName: "events_latest" })
      const allDef = createTableDefinition({ tableName: "events_all" })

      await expect(
        manager.recreateTablePair(latestDef, allDef)
      ).rejects.toThrow("DDL validation error for latest table")
    })

    it("cleans up latest shadow when all shadow DDL fails", async () => {
      vi.mocked(mockDataSource.dropTable).mockResolvedValue()
      vi.mocked(mockDataSource.query)
        .mockResolvedValueOnce([]) // latest shadow succeeds
        .mockRejectedValueOnce(new Error("Type mismatch")) // all shadow fails

      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      const latestDef = createTableDefinition({ tableName: "events_latest" })
      const allDef = createTableDefinition({ tableName: "events_all" })

      await expect(
        manager.recreateTablePair(latestDef, allDef)
      ).rejects.toThrow("DDL validation error for all table")

      // Should clean up the successfully created latest shadow
      const dropCalls = vi.mocked(mockDataSource.dropTable).mock.calls
      expect(dropCalls).toContainEqual([
        "hive",
        "analytics",
        "events_latest__shadow",
      ])
    })

    it("includes recovery info when final creation fails in pair recreate", async () => {
      vi.mocked(mockDataSource.dropTable).mockResolvedValue()
      vi.mocked(mockDataSource.query)
        .mockResolvedValueOnce([]) // latest shadow
        .mockResolvedValueOnce([]) // all shadow
        .mockRejectedValueOnce(new Error("Disk full")) // final creation fails

      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      const latestDef = createTableDefinition({ tableName: "events_latest" })
      const allDef = createTableDefinition({ tableName: "events_all" })

      await expect(
        manager.recreateTablePair(latestDef, allDef)
      ).rejects.toThrow("Shadow tables")
    })

    it("retains shadows when keepShadowTables is true", async () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
        keepShadowTables: true,
      })
      const latestDef = createTableDefinition({ tableName: "events_latest" })
      const allDef = createTableDefinition({ tableName: "events_all" })

      await manager.recreateTablePair(latestDef, allDef)

      const dropCalls = vi.mocked(mockDataSource.dropTable).mock.calls

      // With keepShadowTables: only the original table drops happen (Phase 2)
      expect(dropCalls).toHaveLength(2)
      expect(dropCalls[0]).toStrictEqual(["hive", "analytics", "events_latest"])
      expect(dropCalls[1]).toStrictEqual(["hive", "analytics", "events_all"])
    })
  })

  // ─── buildExternalLocation ───────────────────────────────────────────────

  describe("buildExternalLocation", () => {
    it("concatenates prefix with path using /", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      expect(
        manager.buildExternalLocation("warehouse/events/latest.parquet/")
      ).toBe("s3a://my-bucket/warehouse/events/latest.parquet/")
    })

    it("works with empty path", () => {
      const manager = createHiveTableManager({
        dataSource: mockDataSource,
        files: createMockFiles("s3", "my-bucket"),
      })
      expect(manager.buildExternalLocation("")).toBe("s3a://my-bucket/")
    })
  })
})
