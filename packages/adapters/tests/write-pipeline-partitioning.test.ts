import type { JsonSchema } from "@lakeql/parquet"
import { describe, expect, test, vi, beforeEach } from "vitest"

// oxlint-disable vitest/prefer-import-in-mock -- vi.mock factories use inline definitions per project convention

// Mock @lakeql/parquet
vi.mock("@lakeql/parquet", async () => ({
  writeParquet: vi.fn<() => Uint8Array>(() => new Uint8Array([1, 2, 3, 4])),
}))

// Mock ./storage-operations
const mockUpload =
  vi.fn<(buffer: Uint8Array, targetPath: string) => Promise<void>>()
const mockDeletePrefix = vi.fn<(prefix: string) => Promise<void>>()

vi.mock("../src/storage-operations", async () => ({
  createStorageOperations: vi.fn<
    () => { upload: typeof mockUpload; deletePrefix: typeof mockDeletePrefix }
  >(() => ({
    upload: mockUpload,
    deletePrefix: mockDeletePrefix,
  })),
}))

// Mock ./hive-table-manager
const mockRecreateTable =
  vi.fn<(definition: Record<string, unknown>) => Promise<void>>()
const mockRecreateTablePair =
  vi.fn<
    (
      latestDef: Record<string, unknown>,
      allDef: Record<string, unknown>
    ) => Promise<void>
  >()

vi.mock("../src/hive-table-manager", async () => ({
  createHiveTableManager: vi.fn<
    (config: { client: unknown; bucket: string }) => {
      recreateTable: typeof mockRecreateTable
      recreateTablePair: typeof mockRecreateTablePair
      buildExternalLocation: (path: string) => string
    }
  >((config) => ({
    recreateTable: mockRecreateTable,
    recreateTablePair: mockRecreateTablePair,
    buildExternalLocation: (path: string) => `s3a://${config.bucket}/${path}`,
  })),
}))

// Mock crypto.randomUUID for deterministic partition paths
vi.mock("node:crypto", async () => ({
  default: {
    randomUUID: () => "test-uuid-1234",
  },
}))

// oxlint-disable-next-line import/first -- vi.mock must precede imports per vitest design
import { writeParquet } from "@lakeql/parquet"

// oxlint-disable-next-line import/first -- vi.mock must precede imports per vitest design
import { executeWritePipeline } from "../src/write-pipeline"
// oxlint-disable-next-line import/first -- vi.mock must precede imports per vitest design
import type { WritePipelineInput } from "../src/write-pipeline"

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
  bucket: "my-bucket",
  table: {
    catalog: "hive",
    schema: "analytics",
    tableName: "users",
  },
  trinoClient: {} as unknown as WritePipelineInput["config"]["trinoClient"],
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
    vi.mocked(writeParquet).mockReturnValue(new Uint8Array([1, 2, 3, 4]))
    mockUpload.mockResolvedValue()
    mockDeletePrefix.mockResolvedValue()
    mockRecreateTable.mockResolvedValue()
    mockRecreateTablePair.mockResolvedValue()
  })

  describe("disabled mode × append", () => {
    test("writes to flat path without partition directories", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "append", partitioning: false })
      )

      expect(mockUpload).toHaveBeenCalledExactlyOnceWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/all.parquet/test-uuid-1234.parquet"
      )
    })

    test("does not enrich schema with load_timestamp", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "append", partitioning: false })
      )

      // writeParquet should receive original schema without load_timestamp
      expect(vi.mocked(writeParquet)).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonSchema: baseJsonSchema,
        })
      )
    })

    test("recreates single table pointing to all.parquet/", async () => {
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
        })
      )
    })

    test("does not include load_timestamp in DDL columns", async () => {
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
    test("uploads to both latest.parquet/ and flat all.parquet path", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append", partitioning: false })
      )

      expect(mockUpload).toHaveBeenCalledTimes(2)
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet/test-uuid-1234.parquet"
      )
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/all.parquet/test-uuid-1234.parquet"
      )
    })

    test("deletes latest.parquet prefix before uploading", async () => {
      const callOrder: string[] = []
      mockDeletePrefix.mockImplementation(async () => {
        callOrder.push("deletePrefix")
      })
      mockUpload.mockImplementation(async () => {
        callOrder.push("upload")
      })
      mockRecreateTablePair.mockImplementation(async () => {
        callOrder.push("recreateTablePair")
      })

      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append", partitioning: false })
      )

      expect(callOrder).toStrictEqual([
        "deletePrefix",
        "upload",
        "upload",
        "recreateTablePair",
      ])
    })

    test("recreates table pair with _latest and _all pointing to correct locations", async () => {
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
        })
      )
    })
  })

  describe("timestamp mode × append", () => {
    test("writes to partition path based on current timestamp", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "append", partitioning: true })
      )

      expect(mockUpload).toHaveBeenCalledExactlyOnceWith(
        expect.any(Uint8Array),
        expect.stringMatching(
          /warehouse\/analytics\/users\/all\.parquet\/year=\d{4}\/month=\d{2}\/day=\d{2}\/test-uuid-1234\.parquet/u
        )
      )
    })

    test("enriches schema with load_timestamp before writing parquet", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "append", partitioning: true })
      )

      expect(vi.mocked(writeParquet)).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonSchema: expect.objectContaining({
            properties: expect.objectContaining({
              load_timestamp: { type: "string", format: "date-time" },
            }),
          }),
        })
      )
    })

    test("injects load_timestamp into records", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "append", partitioning: true })
      )

      expect(vi.mocked(writeParquet)).toHaveBeenCalledWith(
        expect.objectContaining({
          records: expect.arrayContaining([
            expect.objectContaining({
              name: "Alice",
              age: 30,
              load_timestamp: expect.stringMatching(
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
              ),
            }),
          ]),
        })
      )
    })

    test("includes load_timestamp in DDL columns", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "append", partitioning: true })
      )

      expect(mockRecreateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: expect.arrayContaining([
            { name: "load_timestamp", type: "TIMESTAMP(3)" },
          ]),
        })
      )
    })

    test("recreates single table pointing to all.parquet/", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "append", partitioning: true })
      )

      expect(mockRecreateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "users",
          externalLocation:
            "s3a://my-bucket/warehouse/analytics/users/all.parquet/",
        })
      )
    })
  })

  describe("timestamp mode × full_load_append", () => {
    test("uploads to both latest.parquet/ and partitioned all.parquet path", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append", partitioning: true })
      )

      expect(mockUpload).toHaveBeenCalledTimes(2)
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet/test-uuid-1234.parquet"
      )
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringMatching(
          /warehouse\/analytics\/users\/all\.parquet\/year=\d{4}\/month=\d{2}\/day=\d{2}\/test-uuid-1234\.parquet/u
        )
      )
    })

    test("enriches schema with load_timestamp for both latest and all uploads", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append", partitioning: true })
      )

      // writeParquet is called once (same buffer used for both uploads)
      expect(vi.mocked(writeParquet)).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonSchema: expect.objectContaining({
            properties: expect.objectContaining({
              load_timestamp: { type: "string", format: "date-time" },
            }),
          }),
        })
      )
    })

    test("recreates table pair with load_timestamp in columns", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append", partitioning: true })
      )

      expect(mockRecreateTablePair).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "users_latest",
          columns: expect.arrayContaining([
            { name: "load_timestamp", type: "TIMESTAMP(3)" },
          ]),
        }),
        expect.objectContaining({
          tableName: "users_all",
          columns: expect.arrayContaining([
            { name: "load_timestamp", type: "TIMESTAMP(3)" },
          ]),
        })
      )
    })
  })

  describe("field mode × append", () => {
    const recordsWithDates = [
      { name: "Alice", age: 30, event_date: "2024-01-15" },
      { name: "Bob", age: 25, event_date: "2024-01-15" },
      { name: "Charlie", age: 35, event_date: "2024-02-20" },
    ]

    const schemaWithDate: JsonSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
        event_date: { type: "string" },
      },
      required: ["name", "event_date"],
    }

    function createFieldInput(
      overrides: Partial<WritePipelineInput["config"]> = {},
      records?: WritePipelineInput["records"]
    ): WritePipelineInput {
      return {
        records: records ?? recordsWithDates,
        jsonSchema: schemaWithDate,
        config: { ...baseConfig, ...overrides },
      }
    }

    test("groups records by partition field and writes separate files per group", async () => {
      await executeWritePipeline(
        createFieldInput({
          loadStrategy: "append",
          partitioning: "event_date",
        })
      )

      // Two different dates should produce 2 uploads (both use same mocked UUID)
      // Since UUID is mocked to be the same, the partition paths differ by date components
      expect(mockUpload).toHaveBeenCalledTimes(2)
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringContaining(
          "year=2024/month=01/day=15/test-uuid-1234.parquet"
        )
      )
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringContaining(
          "year=2024/month=02/day=20/test-uuid-1234.parquet"
        )
      )
    })

    test("does not enrich schema with load_timestamp", async () => {
      await executeWritePipeline(
        createFieldInput({
          loadStrategy: "append",
          partitioning: "event_date",
        })
      )

      // Every writeParquet call should use original schema (without load_timestamp)
      for (const call of vi.mocked(writeParquet).mock.calls) {
        const arg = call[0] as { jsonSchema: JsonSchema }
        expect(arg.jsonSchema.properties).not.toHaveProperty("load_timestamp")
      }
    })

    test("recreates single table after all uploads", async () => {
      await executeWritePipeline(
        createFieldInput({
          loadStrategy: "append",
          partitioning: "event_date",
        })
      )

      expect(mockRecreateTable).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          tableName: "users",
          externalLocation:
            "s3a://my-bucket/warehouse/analytics/users/all.parquet/",
        })
      )
    })

    test("DDL is only performed once regardless of number of groups", async () => {
      await executeWritePipeline(
        createFieldInput({
          loadStrategy: "append",
          partitioning: "event_date",
        })
      )

      expect(mockRecreateTable).toHaveBeenCalledOnce()
    })
  })

  describe("full_load ignores partitioning", () => {
    test("full_load with partitioning=false behaves same as full_load with default", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load", partitioning: false })
      )

      // Should still use full_load behavior: deletePrefix → upload → recreateTable
      expect(mockDeletePrefix).toHaveBeenCalledWith("warehouse/analytics/users")
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet/test-uuid-1234.parquet"
      )
      expect(mockRecreateTable).toHaveBeenCalledOnce()
    })

    test("full_load with partitioning='event_date' behaves same as full_load with default", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load", partitioning: "event_date" })
      )

      expect(mockDeletePrefix).toHaveBeenCalledWith("warehouse/analytics/users")
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet/test-uuid-1234.parquet"
      )
      expect(mockRecreateTable).toHaveBeenCalledOnce()
    })
  })

  describe("partitioningFormat support", () => {
    test("timestamp mode with year format generates year-only partition path", async () => {
      await executeWritePipeline(
        createInput({
          loadStrategy: "append",
          partitioning: true,
          partitioningFormat: "year",
        })
      )

      expect(mockUpload).toHaveBeenCalledExactlyOnceWith(
        expect.any(Uint8Array),
        expect.stringMatching(
          /warehouse\/analytics\/users\/all\.parquet\/year=\d{4}\/test-uuid-1234\.parquet/u
        )
      )
    })

    test("timestamp mode with year/month format generates year+month partition path", async () => {
      await executeWritePipeline(
        createInput({
          loadStrategy: "append",
          partitioning: true,
          partitioningFormat: "year/month",
        })
      )

      expect(mockUpload).toHaveBeenCalledExactlyOnceWith(
        expect.any(Uint8Array),
        expect.stringMatching(
          /warehouse\/analytics\/users\/all\.parquet\/year=\d{4}\/month=\d{2}\/test-uuid-1234\.parquet/u
        )
      )
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

    test("groups records by composite partition key and writes separate files", async () => {
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
        )
      )
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringContaining(
          "customer_id=99/year=2024/month=06/test-uuid-1234.parquet"
        )
      )
    })

    test("does not enrich schema with load_timestamp", async () => {
      await executeWritePipeline(
        createCustomInput({
          loadStrategy: "append",
          partitioning: "customer_id/event_date:year",
        })
      )

      for (const call of vi.mocked(writeParquet).mock.calls) {
        const arg = call[0] as { jsonSchema: JsonSchema }
        expect(arg.jsonSchema.properties).not.toHaveProperty("load_timestamp")
      }
    })

    test("recreates single table after all uploads", async () => {
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
        })
      )
    })

    test("DDL is only performed once regardless of number of groups", async () => {
      await executeWritePipeline(
        createCustomInput({
          loadStrategy: "append",
          partitioning: "customer_id/event_date:year/event_date:month",
        })
      )

      expect(mockRecreateTable).toHaveBeenCalledOnce()
    })

    test("date-only custom format works like legacy but with custom syntax", async () => {
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
        )
      )
    })
  })
})
