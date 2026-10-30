import { assertType, describe, it } from "vitest"
/* oxlint-disable vitest/prefer-describe-function-title -- type-level test: describe titles intentionally name the type under test, which collides with type imports */

import type {
  DataSourceWriteConfig,
  DataSourceWriteInput,
  DataSourceWriteStrategy,
} from "../../src/types/write"

describe("DataSourceWriteConfig variants", () => {
  it("storage-backed config with basePath compiles", () => {
    assertType<DataSourceWriteConfig>({
      table: { catalog: "hive", schema: "raw", tableName: "events" },
      loadStrategy: "full_load",
      basePath: "s3://bucket/prefix",
      keepShadowTables: true,
    })
  })

  it("direct-insert config without basePath compiles", () => {
    assertType<DataSourceWriteConfig>({
      table: { catalog: "fabric", schema: "dbo", tableName: "users" },
      loadStrategy: "append",
    })
  })

  it("minimal config with only table compiles", () => {
    assertType<DataSourceWriteConfig>({
      table: { catalog: "c", schema: "s", tableName: "t" },
    })
  })

  it("config with writeId compiles", () => {
    assertType<DataSourceWriteConfig>({
      table: { catalog: "c", schema: "s", tableName: "t" },
      writeId: "idempotency-key-123",
    })
  })
})

describe("DataSourceWriteStrategy", () => {
  it("write strategy does not require storage imports", () => {
    // Can implement with a simple object literal — no @lakeql/storage needed
    const strategy: DataSourceWriteStrategy = {
      write: async (_input) => {
        // no-op for type assertion
      },
    }
    assertType<DataSourceWriteStrategy>(strategy)
  })
})

describe("DataSourceWriteInput", () => {
  it("write input with records and config compiles", () => {
    assertType<DataSourceWriteInput>({
      records: [{ id: "1", name: "test" }],
      schema: {},
      config: {
        table: { catalog: "c", schema: "s", tableName: "t" },
      },
    })
  })
})
