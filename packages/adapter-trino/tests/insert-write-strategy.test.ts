import type { DataSource, DataSourceWriteInput } from "@lakeql/datasource"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createTrinoInsertWriteStrategy } from "../src/insert-write-strategy"

interface FakeOptions {
  createTable?: boolean
  dropTable?: boolean
  queryImpl?: (sql: string) => Promise<unknown[]>
  dropImpl?: (catalog: string, schema: string, table: string) => Promise<void>
}

interface Fake {
  dataSource: DataSource
  sqls: string[]
  drops: string[]
}

function createFakeDataSource(options: FakeOptions = {}): Fake {
  const sqls: string[] = []
  const drops: string[] = []

  const query = vi.fn<(props: { sql: string }) => Promise<unknown[]>>(
    async (props) => {
      sqls.push(props.sql)
      return options.queryImpl ? options.queryImpl(props.sql) : []
    }
  )
  const dropTable = vi.fn<
    (catalog: string, schema: string, table: string) => Promise<void>
  >(async (catalog, schema, table) => {
    drops.push(`${catalog}.${schema}.${table}`)
    if (options.dropImpl) {
      await options.dropImpl(catalog, schema, table)
    }
  })

  const dataSource = {
    adapter: "trino",
    capabilities: {
      query: true,
      stream: true,
      metadata: {
        catalogs: true,
        schemas: true,
        tables: true,
        views: true,
        columns: true,
      },
      write: { supported: true, modes: [] },
      ddl: {
        createTable: options.createTable ?? true,
        dropTable: options.dropTable ?? true,
      },
    },
    query,
    dropTable,
  } as unknown as DataSource

  return { dataSource, sqls, drops }
}

const schema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    active: { type: "boolean" },
  },
}

function writeInput(
  overrides: Partial<DataSourceWriteInput> = {}
): DataSourceWriteInput {
  return {
    records: [
      { id: 1, name: "a", active: true },
      { id: 2, name: "b", active: false },
    ],
    schema,
    config: {
      table: { catalog: "hive", schema: "analytics", tableName: "events" },
      loadStrategy: "append",
    },
    ...overrides,
  }
}

function fullLoadInput(): DataSourceWriteInput {
  return writeInput({
    config: {
      table: { catalog: "hive", schema: "analytics", tableName: "events" },
      loadStrategy: "full_load",
    },
  })
}

describe(createTrinoInsertWriteStrategy, () => {
  let fake: Fake

  beforeEach(() => {
    fake = createFakeDataSource()
  })

  describe("append", () => {
    it("issues a single INSERT for a batch that fits", async () => {
      const strategy = createTrinoInsertWriteStrategy({
        dataSource: fake.dataSource,
        dataSourceName: "src",
        config: {},
      })

      await strategy.write(writeInput())

      const inserts = fake.sqls.filter((s) => s.startsWith("INSERT INTO"))
      expect(inserts).toHaveLength(1)
      expect(inserts[0]).toContain('"hive"."analytics"."events"')
      expect(inserts[0]).toContain('("id", "name", "active")')
      expect(inserts[0]).toContain("(1, 'a', TRUE), (2, 'b', FALSE)")
    })

    it("splits records into batches bounded by batchSize", async () => {
      const strategy = createTrinoInsertWriteStrategy({
        dataSource: fake.dataSource,
        dataSourceName: "src",
        config: { batchSize: 1 },
      })

      await strategy.write(writeInput())

      const inserts = fake.sqls.filter((s) => s.startsWith("INSERT INTO"))
      expect(inserts).toHaveLength(2)
    })

    it("creates the table first when autoCreateTable is set", async () => {
      const strategy = createTrinoInsertWriteStrategy({
        dataSource: fake.dataSource,
        dataSourceName: "src",
        config: { autoCreateTable: true },
      })

      await strategy.write(writeInput())

      expect(fake.sqls[0]).toContain("CREATE TABLE IF NOT EXISTS")
      expect(fake.sqls[0]).toContain('"id" BIGINT')
      expect(fake.sqls[0]).toContain('"name" VARCHAR')
      expect(fake.sqls[0]).toContain('"active" BOOLEAN')
    })

    it("does nothing for empty records", async () => {
      const strategy = createTrinoInsertWriteStrategy({
        dataSource: fake.dataSource,
        dataSourceName: "src",
        config: {},
      })

      await strategy.write(writeInput({ records: [] }))

      expect(fake.sqls).toHaveLength(0)
    })
  })

  describe("full_load", () => {
    it("creates a pending table, inserts, drops original, renames into place", async () => {
      const strategy = createTrinoInsertWriteStrategy({
        dataSource: fake.dataSource,
        dataSourceName: "src",
        config: {},
      })

      await strategy.write(fullLoadInput())

      const create = fake.sqls.find((s) => s.startsWith("CREATE TABLE"))
      const insert = fake.sqls.find((s) => s.startsWith("INSERT INTO"))
      const rename = fake.sqls.find((s) => s.startsWith("ALTER TABLE"))

      expect(create).toContain("__pending_")
      expect(insert).toContain("__pending_")
      expect(fake.drops).toContain("hive.analytics.events")
      expect(rename).toContain("RENAME TO")
      expect(rename).toContain('"hive"."analytics"."events"')
    })

    it("retains the pending table and reports it when rename fails", async () => {
      const failing = createFakeDataSource({
        queryImpl: async (sql) => {
          if (sql.startsWith("ALTER TABLE")) {
            throw new Error("rename unsupported")
          }
          return []
        },
      })
      const strategy = createTrinoInsertWriteStrategy({
        dataSource: failing.dataSource,
        dataSourceName: "src",
        config: {},
      })

      await expect(strategy.write(fullLoadInput())).rejects.toThrow(
        /Recover from pending table .*__pending_/u
      )
    })

    it("drops the pending table and preserves the original when insert fails", async () => {
      const failing = createFakeDataSource({
        queryImpl: async (sql) => {
          if (sql.startsWith("INSERT INTO")) {
            throw new Error("insert failed")
          }
          return []
        },
      })
      const strategy = createTrinoInsertWriteStrategy({
        dataSource: failing.dataSource,
        dataSourceName: "src",
        config: {},
      })

      await expect(strategy.write(fullLoadInput())).rejects.toThrow(
        /pending table dropped, original unchanged/u
      )
      // The original table was never dropped.
      expect(failing.drops).not.toContain("hive.analytics.events")
    })
  })

  describe("full_load_append", () => {
    it("swaps latest then appends to all", async () => {
      const strategy = createTrinoInsertWriteStrategy({
        dataSource: fake.dataSource,
        dataSourceName: "src",
        config: { autoCreateTable: true },
      })

      await strategy.write(
        writeInput({
          config: {
            table: {
              catalog: "hive",
              schema: "analytics",
              tableName: "events",
            },
            loadStrategy: "full_load_append",
          },
        })
      )

      const renameLatest = fake.sqls.find(
        (s) => s.startsWith("ALTER TABLE") && s.includes('"events_latest"')
      )
      const insertAll = fake.sqls.find(
        (s) => s.startsWith("INSERT INTO") && s.includes('"events_all"')
      )
      expect(renameLatest).toBeDefined()
      expect(insertAll).toBeDefined()
      // latest rename happens before the all insert
      expect(fake.sqls.indexOf(renameLatest as string)).toBeLessThan(
        fake.sqls.indexOf(insertAll as string)
      )
    })
  })

  describe("capability checks", () => {
    it("throws when autoCreateTable is set but createTable is unsupported", async () => {
      const noCreate = createFakeDataSource({ createTable: false })
      const strategy = createTrinoInsertWriteStrategy({
        dataSource: noCreate.dataSource,
        dataSourceName: "src",
        config: { autoCreateTable: true },
      })

      await expect(strategy.write(writeInput())).rejects.toThrow(
        /CREATE TABLE support/u
      )
    })

    it("throws for full_load when dropTable is unsupported", async () => {
      const noDrop = createFakeDataSource({ dropTable: false })
      const strategy = createTrinoInsertWriteStrategy({
        dataSource: noDrop.dataSource,
        dataSourceName: "src",
        config: {},
      })

      await expect(
        strategy.write(
          writeInput({
            config: {
              table: {
                catalog: "hive",
                schema: "analytics",
                tableName: "events",
              },
              loadStrategy: "full_load",
            },
          })
        )
      ).rejects.toThrow(/DROP TABLE support/u)
    })
  })
})
