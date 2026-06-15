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
  StorageError: class StorageError extends Error {
    public readonly path: string
    public readonly operation: "upload" | "delete"

    constructor(
      message: string,
      path: string,
      operation: "upload" | "delete",
      options?: ErrorOptions
    ) {
      super(`Storage ${operation} failed for "${path}": ${message}`, options)
      this.name = "StorageError"
      this.path = path
      this.operation = operation
    }
  },
}))

// Mock ./hive-table-manager
const mockRecreateTable = vi.fn<() => Promise<void>>()
const mockRecreateTablePair = vi.fn<() => Promise<void>>()

vi.mock("../src/hive-table-manager", async () => ({
  createHiveTableManager: vi.fn<
    () => {
      recreateTable: typeof mockRecreateTable
      recreateTablePair: typeof mockRecreateTablePair
    }
  >(() => ({
    recreateTable: mockRecreateTable,
    recreateTablePair: mockRecreateTablePair,
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
  overrides: Partial<WritePipelineInput["config"]> = {}
): WritePipelineInput {
  return {
    records: [{ name: "Alice", age: 30 }],
    jsonSchema: baseJsonSchema,
    config: { ...baseConfig, ...overrides },
  }
}

describe(executeWritePipeline, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(writeParquet).mockReturnValue(new Uint8Array([1, 2, 3, 4]))
    mockUpload.mockResolvedValue()
    mockDeletePrefix.mockResolvedValue()
    mockRecreateTable.mockResolvedValue()
    mockRecreateTablePair.mockResolvedValue()
  })

  describe("full_load strategy", () => {
    test("executes deletePrefix → upload → recreateTable in order", async () => {
      const callOrder: string[] = []
      mockDeletePrefix.mockImplementation(async () => {
        callOrder.push("deletePrefix")
      })
      mockUpload.mockImplementation(async () => {
        callOrder.push("upload")
      })
      mockRecreateTable.mockImplementation(async () => {
        callOrder.push("recreateTable")
      })

      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(callOrder).toStrictEqual([
        "deletePrefix",
        "upload",
        "recreateTable",
      ])
    })

    test("deletes prefix at basePath", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(mockDeletePrefix).toHaveBeenCalledWith("warehouse/analytics/users")
    })

    test("uploads to basePath/latest.parquet", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet"
      )
    })

    test("recreates table with correct definition", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(mockRecreateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          catalog: "hive",
          schema: "analytics",
          tableName: "users",
          externalLocation:
            "s3://my-bucket/warehouse/analytics/users/latest.parquet",
          columns: expect.arrayContaining([
            { name: "name", type: "VARCHAR" },
            { name: "age", type: "BIGINT" },
          ]),
        })
      )
    })
  })

  describe("full_load_append strategy", () => {
    test("executes deletePrefix → upload latest → upload all → recreateTablePair in order", async () => {
      const callOrder: string[] = []
      mockDeletePrefix.mockImplementation(async () => {
        callOrder.push("deletePrefix")
      })
      mockUpload.mockImplementation(async (_buffer: unknown, path: string) => {
        if (path.includes("latest.parquet")) {
          callOrder.push("upload:latest")
        } else if (path.includes("all.parquet")) {
          callOrder.push("upload:all")
        }
      })
      mockRecreateTablePair.mockImplementation(async () => {
        callOrder.push("recreateTablePair")
      })

      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append" })
      )

      expect(callOrder).toStrictEqual([
        "deletePrefix",
        "upload:latest",
        "upload:all",
        "recreateTablePair",
      ])
    })

    test("uploads to both latest.parquet and all.parquet/<partition_path>", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append" })
      )

      expect(mockUpload).toHaveBeenCalledTimes(2)
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet"
      )
      // The all path includes partition path with our mocked UUID
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringMatching(
          /warehouse\/analytics\/users\/all\.parquet\/year=\d{4}\/month=\d{2}\/day=\d{2}\/test-uuid-1234\.parquet/u
        )
      )
    })

    test("recreates table pair with _latest and _all table names", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append" })
      )

      expect(mockRecreateTablePair).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "users_latest",
          externalLocation:
            "s3://my-bucket/warehouse/analytics/users/latest.parquet",
        }),
        expect.objectContaining({
          tableName: "users_all",
          externalLocation:
            "s3://my-bucket/warehouse/analytics/users/all.parquet/",
        })
      )
    })
  })

  describe("append strategy", () => {
    test("executes only upload → recreateTable (no delete, no latest)", async () => {
      const callOrder: string[] = []
      mockUpload.mockImplementation(async () => {
        callOrder.push("upload")
      })
      mockRecreateTable.mockImplementation(async () => {
        callOrder.push("recreateTable")
      })

      await executeWritePipeline(createInput({ loadStrategy: "append" }))

      expect(callOrder).toStrictEqual(["upload", "recreateTable"])
      expect(mockDeletePrefix).not.toHaveBeenCalled()
    })

    test("uploads to all.parquet/<partition_path> only", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "append" }))

      expect(mockUpload).toHaveBeenCalledExactlyOnceWith(
        expect.any(Uint8Array),
        expect.stringMatching(
          /warehouse\/analytics\/users\/all\.parquet\/year=\d{4}\/month=\d{2}\/day=\d{2}\/test-uuid-1234\.parquet/u
        )
      )
    })

    test("recreates single table pointing to all.parquet/", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "append" }))

      expect(mockRecreateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "users",
          externalLocation:
            "s3://my-bucket/warehouse/analytics/users/all.parquet/",
        })
      )
    })

    test("does not upload to latest.parquet", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "append" }))

      const uploadCalls = mockUpload.mock.calls
      const latestCalls = uploadCalls.filter((call: unknown[]) =>
        (call[1] as string).includes("latest.parquet")
      )
      expect(latestCalls).toHaveLength(0)
    })
  })

  describe("default load strategy", () => {
    test("defaults to full_load when loadStrategy is undefined", async () => {
      const callOrder: string[] = []
      mockDeletePrefix.mockImplementation(async () => {
        callOrder.push("deletePrefix")
      })
      mockUpload.mockImplementation(async () => {
        callOrder.push("upload")
      })
      mockRecreateTable.mockImplementation(async () => {
        callOrder.push("recreateTable")
      })

      const input = createInput()
      // Explicitly remove loadStrategy to test default
      delete input.config.loadStrategy

      await executeWritePipeline(input)

      // Should behave like full_load
      expect(callOrder).toStrictEqual([
        "deletePrefix",
        "upload",
        "recreateTable",
      ])
      expect(mockDeletePrefix).toHaveBeenCalledWith("warehouse/analytics/users")
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet"
      )
    })
  })

  describe("fail-fast error propagation", () => {
    test("Parquet failure stops before S3 operations", async () => {
      vi.mocked(writeParquet).mockImplementation(() => {
        throw new Error("Parquet conversion failed")
      })

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load" }))
      ).rejects.toThrow("Parquet conversion failed")

      expect(mockDeletePrefix).not.toHaveBeenCalled()
      expect(mockUpload).not.toHaveBeenCalled()
      expect(mockRecreateTable).not.toHaveBeenCalled()
    })

    test("S3 deletePrefix failure stops before upload and DDL", async () => {
      mockDeletePrefix.mockRejectedValue(new Error("S3 delete failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load" }))
      ).rejects.toThrow("S3 delete failed")

      expect(mockUpload).not.toHaveBeenCalled()
      expect(mockRecreateTable).not.toHaveBeenCalled()
    })

    test("S3 upload failure stops before DDL operations", async () => {
      mockUpload.mockRejectedValue(new Error("S3 upload failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load" }))
      ).rejects.toThrow("S3 upload failed")

      expect(mockRecreateTable).not.toHaveBeenCalled()
    })

    test("DDL failure propagates error in full_load", async () => {
      mockRecreateTable.mockRejectedValue(new Error("DDL failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load" }))
      ).rejects.toThrow("DDL failed")
    })

    test("historical upload failure stops before DDL in full_load_append", async () => {
      // First upload (latest) succeeds, second (all) fails
      mockUpload
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error("Historical upload failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load_append" }))
      ).rejects.toThrow("Historical upload failed")

      expect(mockRecreateTablePair).not.toHaveBeenCalled()
    })
  })

  describe("rollback on full_load_append DDL failure", () => {
    test("DDL failure in full_load_append triggers rollback via recreateTablePair", async () => {
      // recreateTablePair internally handles rollback — we verify it's called
      // and that its error is propagated
      mockRecreateTablePair.mockRejectedValue(
        new Error(
          "Failed to create table pair: DDL error. Rollback succeeded: both tables were dropped."
        )
      )

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load_append" }))
      ).rejects.toThrow("Failed to create table pair")

      expect(mockRecreateTablePair).toHaveBeenCalledOnce()
    })

    test("DDL failure with partial rollback propagates error", async () => {
      mockRecreateTablePair.mockRejectedValue(
        new Error(
          "Failed to create table pair: DDL error. Rollback partially failed: some tables may still exist."
        )
      )

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load_append" }))
      ).rejects.toThrow("Rollback partially failed")
    })
  })
})
