import type { JsonSchema } from "@lakeql/parquet"
import { describe, expect, vi, beforeEach, it } from "vitest"

import type { Serializer, SerializerOutput } from "../src/serializer/types"
import type { StorageOperations } from "../src/storage-operations"
import type { ManagedTableDefinition } from "../src/table-manager/types"

// Mock crypto.randomUUID for deterministic partition paths
vi.mock(import("node:crypto"), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: {
      ...actual.default,
      randomUUID: () =>
        "test-uuid-1234" as `${string}-${string}-${string}-${string}-${string}`,
    },
  }
})

// oxlint-disable-next-line import/first -- vi.mock must precede imports per vitest design
import {
  executeWritePipeline,
  resolvePartitioningConfig,
} from "../src/write-pipeline"
// oxlint-disable-next-line import/first -- vi.mock must precede imports per vitest design
import type { WritePipelineInput } from "../src/write-pipeline"

// --- Mock storage operations ---
const mockUpload =
  vi.fn<(buffer: Uint8Array, targetPath: string) => Promise<void>>()
const mockDeletePrefix = vi.fn<(prefix: string) => Promise<void>>()
const mockListPrefix = vi.fn<(prefix: string) => Promise<string[]>>()
const mockDeleteKeys = vi.fn<(keys: string[]) => Promise<void>>()

const mockStorage: StorageOperations = {
  upload: mockUpload,
  deletePrefix: mockDeletePrefix,
  listPrefix: mockListPrefix,
  deleteKeys: mockDeleteKeys,
}

// --- Mock serializer ---
const mockSerialize =
  vi.fn<
    (
      records: Record<string, unknown>[],
      schema: unknown
    ) => Promise<SerializerOutput>
  >()

const mockSerializer: Serializer = {
  serialize: mockSerialize,
}

// --- Mock table manager ---
const mockRecreateTable =
  vi.fn<(definition: ManagedTableDefinition) => Promise<void>>()
const mockRecreateTablePair =
  vi.fn<
    (
      latestDef: ManagedTableDefinition,
      allDef: ManagedTableDefinition
    ) => Promise<void>
  >()

const mockTableManager = {
  createTable: vi.fn<() => Promise<void>>(),
  dropTable: vi.fn<() => Promise<void>>(),
  recreateTable: mockRecreateTable,
  recreateTablePair: mockRecreateTablePair,
  buildExternalLocation: (path: string) => `s3a://my-bucket/${path}`,
}

const baseJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    age: { type: "integer" },
  },
  required: ["name"],
}

const baseConfig: WritePipelineInput["config"] = {
  basePath: "warehouse/analytics/users",
  table: {
    catalog: "hive",
    schema: "analytics",
    tableName: "users",
  },
  storage: mockStorage,
  tableManager: mockTableManager,
  serializer: mockSerializer,
}

function createInput(
  overrides: Partial<WritePipelineInput["config"]> = {},
  records?: WritePipelineInput["records"]
): WritePipelineInput {
  return {
    records: records ?? [{ name: "Alice", age: 30 }],
    jsonSchema: baseJsonSchema,
    config: { ...baseConfig, ...overrides },
  }
}

describe("executeWritePipeline — partitioning modes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSerialize.mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3, 4]),
      extension: "parquet",
      contentType: "application/vnd.apache.parquet",
    })
    mockUpload.mockResolvedValue()
    mockDeletePrefix.mockResolvedValue()
    mockListPrefix.mockResolvedValue([])
    mockDeleteKeys.mockResolvedValue()
    mockRecreateTable.mockResolvedValue()
    mockRecreateTablePair.mockResolvedValue()
  })

  describe("disabled mode × append", () => {
    it("writes to flat path without partition directories", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "append", partitioning: false })
      )

      expect(mockUpload).toHaveBeenCalledExactlyOnceWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/all.parquet/test-uuid-1234.parquet",
        expect.objectContaining({})
      )
    })

    it("does not enrich schema with load_timestamp when serializing", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "append", partitioning: false })
      )

      // Serializer should receive original schema without load_timestamp
      expect(mockSerialize).toHaveBeenCalledWith(
        expect.anything(),
        baseJsonSchema
      )
    })

    it("recreates single table pointing to all.parquet/", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "append", partitioning: false })
      )

      expect(mockRecreateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "users",
          externalLocation:
            "s3a://my-bucket/warehouse/analytics/users/all.parquet/",
          columns: expect.arrayContaining([
            { name: "name", type: "VARCHAR" },
            { name: "age", type: "BIGINT" },
          ]),
        }),
        expect.objectContaining({})
      )
    })

    it("does not include load_timestamp in DDL columns", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "append", partitioning: false })
      )

      const call = mockRecreateTable.mock.calls[0]?.[0] as {
        columns: { name: string; type: string }[]
      }
      const columnNames = call.columns.map((c) => c.name)
      expect(columnNames).not.toContain("load_timestamp")
    })
  })

  describe("disabled mode × full_load_append", () => {
    it("uploads to both latest.parquet/ and flat all.parquet path", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append", partitioning: false })
      )

      expect(mockUpload).toHaveBeenCalledTimes(2)
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet/test-uuid-1234.parquet",
        expect.objectContaining({})
      )
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/all.parquet/test-uuid-1234.parquet",
        expect.objectContaining({})
      )
    })

    it("lists old files, uploads, performs DDL, then deletes old files", async () => {
      const callOrder: string[] = []
      mockListPrefix.mockImplementation(async () => {
        callOrder.push("listPrefix")
        return ["warehouse/analytics/users/latest.parquet/old-file.parquet"]
      })
      mockUpload.mockImplementation(async () => {
        callOrder.push("upload")
      })
      mockRecreateTablePair.mockImplementation(async () => {
        callOrder.push("recreateTablePair")
      })
      mockDeleteKeys.mockImplementation(async () => {
        callOrder.push("deleteKeys")
      })

      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append", partitioning: false })
      )

      expect(callOrder).toStrictEqual([
        "listPrefix",
        "upload",
        "upload",
        "recreateTablePair",
        "deleteKeys",
      ])
    })

    it("recreates table pair with _latest and _all pointing to correct locations", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append", partitioning: false })
      )

      expect(mockRecreateTablePair).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "users_latest",
          externalLocation:
            "s3a://my-bucket/warehouse/analytics/users/latest.parquet/",
        }),
        expect.objectContaining({
          tableName: "users_all",
          externalLocation:
            "s3a://my-bucket/warehouse/analytics/users/all.parquet/",
        }),
        expect.objectContaining({})
      )
    })
  })

  describe("auto-fill populate (field-driven, independent of partitioning)", () => {
    const autoFill = [{ name: "ingested_at", kind: "write_timestamp" as const }]

    it("populates the declared field, year and month companions on every record", async () => {
      await executeWritePipeline(
        createInput({
          loadStrategy: "append",
          partitioning: false,
          autoFillFields: autoFill,
        })
      )

      expect(mockSerialize).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Alice",
            age: 30,
            ingested_at: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
            ),
            ingested_at_year: expect.any(Number),
            ingested_at_month: expect.any(Number),
          }),
        ]),
        expect.anything()
      )
    })

    it("uses the declared field name, not a hard-coded load_timestamp", async () => {
      await executeWritePipeline(
        createInput({
          loadStrategy: "append",
          partitioning: false,
          autoFillFields: autoFill,
        })
      )

      const records = mockSerialize.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >[]
      expect(records[0]).not.toHaveProperty("load_timestamp")
      expect(records[0]).toHaveProperty("ingested_at")
    })

    it("enriches schema with the declared field plus companions as columns", async () => {
      await executeWritePipeline(
        createInput({
          loadStrategy: "append",
          partitioning: false,
          autoFillFields: autoFill,
        })
      )

      expect(mockSerialize).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          properties: expect.objectContaining({
            ingested_at: { type: "string", format: "date-time" },
            ingested_at_year: { type: "integer" },
            ingested_at_month: { type: "integer" },
          }),
        })
      )
    })

    it("includes the auto-fill columns in the DDL even when partitioning is disabled (C10)", async () => {
      await executeWritePipeline(
        createInput({
          loadStrategy: "append",
          partitioning: false,
          autoFillFields: autoFill,
        })
      )

      const call = mockRecreateTable.mock.calls[0]?.[0] as {
        columns: { name: string; type: string }[]
      }
      expect(call.columns).toStrictEqual(
        expect.arrayContaining([
          { name: "ingested_at", type: "TIMESTAMP(3)" },
          { name: "ingested_at_year", type: "BIGINT" },
          { name: "ingested_at_month", type: "BIGINT" },
        ])
      )
    })

    it("writes a flat path (no partition directories) when partitioning is disabled (C10)", async () => {
      await executeWritePipeline(
        createInput({
          loadStrategy: "append",
          partitioning: false,
          autoFillFields: autoFill,
        })
      )

      expect(mockUpload).toHaveBeenCalledExactlyOnceWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/all.parquet/test-uuid-1234.parquet",
        expect.objectContaining({})
      )
    })

    it("shares one write-clock value across multiple auto-fill fields (C14)", async () => {
      await executeWritePipeline(
        createInput({
          loadStrategy: "append",
          partitioning: false,
          autoFillFields: [
            { name: "created_at", kind: "write_timestamp" },
            { name: "updated_at", kind: "write_timestamp" },
          ],
        })
      )

      const records = mockSerialize.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >[]
      expect(records[0]?.created_at).toBe(records[0]?.updated_at)
      expect(records[0]?.created_at_year).toBe(records[0]?.updated_at_year)
      expect(records[0]?.created_at_month).toBe(records[0]?.updated_at_month)
    })
  })

  describe("auto-fill populate × custom partition (R1 regression, C5)", () => {
    it("partitions over the populated field even when input records omit it", async () => {
      // Records do NOT carry ingested_at; the pipeline must populate it before
      // the custom grouping reads it, otherwise PartitionFieldError('missing').
      await executeWritePipeline(
        createInput(
          {
            loadStrategy: "append",
            partitioning: "ingested_at:year/ingested_at:month",
            autoFillFields: [{ name: "ingested_at", kind: "write_timestamp" }],
          },
          [
            { name: "Alice", age: 30 },
            { name: "Bob", age: 25 },
          ]
        )
      )

      // Both records share the single write clock → one partition group.
      expect(mockUpload).toHaveBeenCalledExactlyOnceWith(
        expect.any(Uint8Array),
        expect.stringMatching(
          /warehouse\/analytics\/users\/all\.parquet\/year=\d{4}\/month=\d{2}\/test-uuid-1234\.parquet/u
        ),
        expect.objectContaining({})
      )
      expect(mockRecreateTable).toHaveBeenCalledOnce()
    })
  })

  describe("resolvePartitioningConfig never returns timestamp", () => {
    it("treats true and false alike as disabled; strings select field/custom", () => {
      expect(resolvePartitioningConfig(false).mode).toBe("disabled")
      expect(resolvePartitioningConfig(undefined).mode).toBe("disabled")
      expect(resolvePartitioningConfig("event_date").mode).toBe("custom")
      expect(resolvePartitioningConfig("event_date:year").mode).toBe("custom")
    })
  })

  describe("bare field name × append (raw value)", () => {
    const records = [
      { name: "Alice", age: 30, region: "EU" },
      { name: "Bob", age: 25, region: "EU" },
      { name: "Charlie", age: 35, region: "US" },
    ]

    const schema: JsonSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
        region: { type: "string" },
      },
      required: ["name", "region"],
    }

    function createRegionInput(
      overrides: Partial<WritePipelineInput["config"]> = {}
    ): WritePipelineInput {
      return {
        records,
        jsonSchema: schema,
        config: { ...baseConfig, loadStrategy: "append", ...overrides },
      }
    }

    it("writes region=EU for a bare non-date field and does not throw", async () => {
      await executeWritePipeline(createRegionInput({ partitioning: "region" }))

      expect(mockUpload).toHaveBeenCalledTimes(2)
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/all.parquet/region=EU/test-uuid-1234.parquet",
        expect.objectContaining({})
      )
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/all.parquet/region=US/test-uuid-1234.parquet",
        expect.objectContaining({})
      )
    })

    it("recreates the single table once after all uploads", async () => {
      await executeWritePipeline(createRegionInput({ partitioning: "region" }))

      expect(mockRecreateTable).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          tableName: "users",
          externalLocation:
            "s3a://my-bucket/warehouse/analytics/users/all.parquet/",
        }),
        expect.objectContaining({})
      )
    })

    it("does not enrich schema with load_timestamp when serializing", async () => {
      await executeWritePipeline(createRegionInput({ partitioning: "region" }))

      for (const call of mockSerialize.mock.calls) {
        const serialized = call[1] as JsonSchema
        expect(serialized.properties).not.toHaveProperty("load_timestamp")
      }
    })
  })

  describe("full_load ignores partitioning", () => {
    it("full_load with partitioning=false behaves same as full_load with default", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load", partitioning: false })
      )

      // Should still use full_load behavior: listPrefix → upload → recreateTable
      expect(mockListPrefix).toHaveBeenCalledWith(
        "warehouse/analytics/users/latest.parquet"
      )
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet/test-uuid-1234.parquet",
        expect.objectContaining({})
      )
      expect(mockRecreateTable).toHaveBeenCalledOnce()
    })

    it("full_load with partitioning='event_date' behaves same as full_load with default", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load", partitioning: "event_date" })
      )

      expect(mockListPrefix).toHaveBeenCalledWith(
        "warehouse/analytics/users/latest.parquet"
      )
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet/test-uuid-1234.parquet",
        expect.objectContaining({})
      )
      expect(mockRecreateTable).toHaveBeenCalledOnce()
    })
  })

  describe("custom mode × append", () => {
    const recordsWithCustomFields = [
      { name: "Alice", age: 30, customer_id: 42, event_date: "2024-06-15" },
      { name: "Bob", age: 25, customer_id: 42, event_date: "2024-06-20" },
      { name: "Charlie", age: 35, customer_id: 99, event_date: "2024-06-15" },
    ]

    const schemaWithCustomFields: JsonSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
        customer_id: { type: "integer" },
        event_date: { type: "string" },
      },
      required: ["name", "customer_id", "event_date"],
    }

    function createCustomInput(
      overrides: Partial<WritePipelineInput["config"]> = {},
      records?: WritePipelineInput["records"]
    ): WritePipelineInput {
      return {
        records: records ?? recordsWithCustomFields,
        jsonSchema: schemaWithCustomFields,
        config: { ...baseConfig, ...overrides },
      }
    }

    it("groups records by composite partition key and writes separate files", async () => {
      await executeWritePipeline(
        createCustomInput({
          loadStrategy: "append",
          partitioning: "customer_id/event_date:year/event_date:month",
        })
      )

      // customer_id=42 + year=2024 + month=06 → one group (Alice + Bob)
      // customer_id=99 + year=2024 + month=06 → another group (Charlie)
      expect(mockUpload).toHaveBeenCalledTimes(2)
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringContaining(
          "customer_id=42/year=2024/month=06/test-uuid-1234.parquet"
        ),
        expect.objectContaining({})
      )
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringContaining(
          "customer_id=99/year=2024/month=06/test-uuid-1234.parquet"
        ),
        expect.objectContaining({})
      )
    })

    it("does not enrich schema with load_timestamp when serializing", async () => {
      await executeWritePipeline(
        createCustomInput({
          loadStrategy: "append",
          partitioning: "customer_id/event_date:year",
        })
      )

      for (const call of mockSerialize.mock.calls) {
        const schema = call[1] as JsonSchema
        expect(schema.properties).not.toHaveProperty("load_timestamp")
      }
    })

    it("recreates single table after all uploads", async () => {
      await executeWritePipeline(
        createCustomInput({
          loadStrategy: "append",
          partitioning: "customer_id/event_date:year/event_date:month",
        })
      )

      expect(mockRecreateTable).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          tableName: "users",
          externalLocation:
            "s3a://my-bucket/warehouse/analytics/users/all.parquet/",
        }),
        expect.objectContaining({})
      )
    })

    it("DDL is only performed once regardless of number of groups", async () => {
      await executeWritePipeline(
        createCustomInput({
          loadStrategy: "append",
          partitioning: "customer_id/event_date:year/event_date:month",
        })
      )

      expect(mockRecreateTable).toHaveBeenCalledOnce()
    })

    it("date-only custom format works like legacy but with custom syntax", async () => {
      await executeWritePipeline(
        createCustomInput(
          {
            loadStrategy: "append",
            partitioning: "event_date:year/event_date:month/event_date:day",
          },
          [
            {
              name: "Alice",
              age: 30,
              customer_id: 42,
              event_date: "2024-06-15",
            },
            { name: "Bob", age: 25, customer_id: 42, event_date: "2024-06-15" },
          ]
        )
      )

      // Both records have same date → one group
      expect(mockUpload).toHaveBeenCalledExactlyOnceWith(
        expect.any(Uint8Array),
        expect.stringContaining(
          "year=2024/month=06/day=15/test-uuid-1234.parquet"
        ),
        expect.objectContaining({})
      )
    })
  })
})
