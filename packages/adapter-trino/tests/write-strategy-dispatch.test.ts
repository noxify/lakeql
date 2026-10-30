import type { DataSource } from "@lakeql/datasource"
import { describe, expect, it, vi } from "vitest"

import { trinoAdapterFactory } from "../src/adapter"

function fakeDataSource(): { dataSource: DataSource; sqls: string[] } {
  const sqls: string[] = []
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
      ddl: { createTable: true, dropTable: true },
    },
    query: vi.fn<(props: { sql: string }) => Promise<unknown[]>>(
      async (props) => {
        sqls.push(props.sql)
        return []
      }
    ),
    dropTable: vi.fn<() => Promise<void>>(async () => {}),
  } as unknown as DataSource
  return { dataSource, sqls }
}

const writeInput = {
  records: [{ id: 1 }],
  schema: { type: "object", properties: { id: { type: "integer" } } },
  config: {
    table: { catalog: "hive", schema: "analytics", tableName: "events" },
    loadStrategy: "append" as const,
  },
}

describe("trinoAdapterFactory.createWriteStrategy dispatch", () => {
  it("selects the INSERT strategy for strategy: insert", async () => {
    const { dataSource, sqls } = fakeDataSource()

    const strategy = trinoAdapterFactory.createWriteStrategy({
      dataSource,
      dataSourceName: "src",
      writeConfig: { strategy: "insert" },
    })

    await strategy.write(writeInput)

    expect(sqls.some((s) => s.startsWith("INSERT INTO"))).toBeTruthy()
  })

  it("defaults to the storage strategy when strategy is omitted", () => {
    const { dataSource } = fakeDataSource()

    // Route to the storage strategy with a files-sdk adapter that exposes a
    // name but no bucket. Construction of the storage strategy resolves the
    // Hive external-location prefix and fails with a storage-specific error.
    // The insert strategy never touches files, so this deterministic failure
    // confirms the omitted strategy routed to the storage path.
    const files = { adapter: { name: "s3" } }

    expect(() =>
      trinoAdapterFactory.createWriteStrategy({
        dataSource,
        dataSourceName: "src",
        writeConfig: { files, serializer: {} },
      })
    ).toThrow(/cannot resolve bucket/iu)
  })

  it("rejects an unknown strategy", () => {
    const { dataSource } = fakeDataSource()

    expect(() =>
      trinoAdapterFactory.createWriteStrategy({
        dataSource,
        dataSourceName: "src",
        writeConfig: { strategy: "copy" },
      })
    ).toThrow(/unknown strategy/iu)
  })

  it("rejects surplus fields for the insert strategy", () => {
    const { dataSource } = fakeDataSource()

    expect(() =>
      trinoAdapterFactory.createWriteStrategy({
        dataSource,
        dataSourceName: "src",
        writeConfig: { strategy: "insert", files: {} },
      })
    ).toThrow(/unexpected field/iu)
  })
})
