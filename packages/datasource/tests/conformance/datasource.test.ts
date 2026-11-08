import { describe, expect, it } from "vitest"

import type { DataSourceCapabilities } from "../../src/types/capabilities"
import type { DataSource } from "../../src/types/datasource"

/**
 * Reusable DataSource conformance test suite.
 *
 * Validates that a DataSource implementation satisfies the interface
 * contract. Adapter packages (Trino, Fabric, etc.) can import and run
 * this suite against their own implementations.
 *
 * @param factory - A zero-argument function that creates a fresh DataSource instance for each test run.
 */
export function runDataSourceConformanceTests(factory: () => DataSource): void {
  describe("DataSource conformance", () => {
    it("exposes adapter as a string", () => {
      const ds = factory()
      expect(ds.adapter).toBeTypeOf("string")
      expect(ds.adapter.length).toBeGreaterThan(0)
    })

    describe("capabilities", () => {
      it("exposes query and stream capability flags", () => {
        const ds = factory()
        const caps: DataSourceCapabilities = ds.capabilities

        expect(caps.query).toBeTypeOf("boolean")
        expect(caps.stream).toBeTypeOf("boolean")
      })

      it("exposes metadata capability flags", () => {
        const ds = factory()
        const caps: DataSourceCapabilities = ds.capabilities

        expect(caps.metadata.catalogs).toBeTypeOf("boolean")
        expect(caps.metadata.schemas).toBeTypeOf("boolean")
        expect(caps.metadata.tables).toBeTypeOf("boolean")
        expect(caps.metadata.views).toBeTypeOf("boolean")
        expect(caps.metadata.columns).toBeTypeOf("boolean")
      })

      it("exposes write capability flags", () => {
        const ds = factory()
        const caps: DataSourceCapabilities = ds.capabilities

        expect(caps.write.supported).toBeTypeOf("boolean")
        expect(Array.isArray(caps.write.modes)).toBeTruthy()
      })

      it("exposes ddl capability flags", () => {
        const ds = factory()
        const caps: DataSourceCapabilities = ds.capabilities

        expect(caps.ddl.createTable).toBeTypeOf("boolean")
        expect(caps.ddl.dropTable).toBeTypeOf("boolean")
      })
    })

    describe("query operations", () => {
      it("query() returns an array", async () => {
        const ds = factory()
        const result = await ds.query({ sql: "SELECT 1" })
        expect(Array.isArray(result)).toBeTruthy()
      })

      it("stream() returns an async iterable", async () => {
        const ds = factory()
        const generator = await ds.stream({ sql: "SELECT 1" })
        expect(generator[Symbol.asyncIterator]).toBeTypeOf("function")
      })
    })

    describe("metadata discovery", () => {
      it("catalogs() returns an array", async () => {
        const ds = factory()
        const result = await ds.catalogs()
        expect(Array.isArray(result)).toBeTruthy()
      })

      it("schemas() returns an array", async () => {
        const ds = factory()
        const result = await ds.schemas("default")
        expect(Array.isArray(result)).toBeTruthy()
      })

      it("tables() returns an array", async () => {
        const ds = factory()
        const result = await ds.tables("default", "public")
        expect(Array.isArray(result)).toBeTruthy()
      })

      it("views() returns an array", async () => {
        const ds = factory()
        const result = await ds.views("default", "public")
        expect(Array.isArray(result)).toBeTruthy()
      })

      it("columns() returns an array", async () => {
        const ds = factory()
        const result = await ds.columns("default", "public", "users")
        expect(Array.isArray(result)).toBeTruthy()
      })
    })

    describe("DDL operations", () => {
      it("createTable() resolves without error", async () => {
        const ds = factory()
        await expect(
          ds.createTable({
            catalog: "default",
            schema: "public",
            table: "test_table",
            columns: [{ name: "id", type: "INTEGER" }],
          })
        ).resolves.toBeUndefined()
      })

      it("dropTable() resolves without error", async () => {
        const ds = factory()
        await expect(
          ds.dropTable("default", "public", "test_table")
        ).resolves.toBeUndefined()
      })
    })

    describe("utility methods", () => {
      it("qualifiedTableName() returns a string", () => {
        const ds = factory()
        const name = ds.qualifiedTableName({
          dataSource: "test",
          adapter: "fake",
          catalog: "default",
          schema: "public",
          tableName: "users",
        })
        expect(name).toBeTypeOf("string")
        expect(name.length).toBeGreaterThan(0)
      })
    })

    describe("lifecycle", () => {
      it("close() resolves without error", async () => {
        const ds = factory()
        await expect(ds.close()).resolves.toBeUndefined()
      })
    })
  })
}

// --- Minimal inline fake for running these tests until task 3.4 lands ---

async function* emptyGenerator<TRow>(): AsyncGenerator<TRow> {
  // yields nothing
}

function createFakeDataSource(): DataSource {
  return {
    adapter: "fake",
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
      write: {
        supported: true,
        modes: ["full_load", "append"],
      },
      ddl: {
        createTable: true,
        dropTable: true,
      },
    },
    typeMapper: {
      toPrimitiveType: () => "String",
      toEngineType: (primitiveType) => primitiveType,
    },
    query: async () => [],
    stream: async () => emptyGenerator(),
    catalogs: async () => [],
    schemas: async () => [],
    tables: async () => [],
    views: async () => [],
    columns: async () => [],
    createTable: async () => {
      // no-op
    },
    dropTable: async () => {
      // no-op
    },
    qualifiedTableName: (config) =>
      `${config.catalog}.${config.schema}.${config.tableName}`,
    close: async () => {
      // no-op
    },
  }
}

// Run the conformance suite against the inline fake
runDataSourceConformanceTests(createFakeDataSource)

/**
 * Serializer and upload contract type-level tests belong in the future
 * storage contract package (per design decision 1). The package-boundary
 * test in this package already blocks `@lakeql/storage` imports, ensuring
 * the core datasource contracts remain independent of concrete storage
 * providers.
 */
