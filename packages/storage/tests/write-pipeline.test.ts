import type { JsonSchema } from "@lakeql/parquet"
import { describe, expect, vi, beforeEach, it } from "vitest"

import type { Serializer, SerializerOutput } from "../src/serializer/types"
import type { StorageOperations } from "../src/storage-operations"

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
import { executeWritePipeline } from "../src/write-pipeline"
// oxlint-disable-next-line import/first -- vi.mock must precede imports per vitest design
import type { WritePipelineInput } from "../src/write-pipeline"

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

const mockRecreateTable = vi.fn<() => Promise<void>>()
const mockRecreateTablePair = vi.fn<() => Promise<void>>()

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

  describe("full_load strategy", () => {
    it("executes listPrefix → upload → recreateTable → deleteKeys in order", async () => {
      const callOrder: string[] = []
      mockListPrefix.mockImplementation(async () => {
        callOrder.push("listPrefix")
        return ["warehouse/analytics/users/latest.parquet/old-file.parquet"]
      })
      mockUpload.mockImplementation(async () => {
        callOrder.push("upload")
      })
      mockRecreateTable.mockImplementation(async () => {
        callOrder.push("recreateTable")
      })
      mockDeleteKeys.mockImplementation(async () => {
        callOrder.push("deleteKeys")
      })

      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(callOrder).toStrictEqual([
        "listPrefix",
        "upload",
        "recreateTable",
        "deleteKeys",
      ])
    })

    it("lists prefix at latestDir", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(mockListPrefix).toHaveBeenCalledWith(
        "warehouse/analytics/users/latest.parquet"
      )
    })

    it("skips deleteKeys when no old files exist", async () => {
      mockListPrefix.mockResolvedValue([])

      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(mockDeleteKeys).not.toHaveBeenCalled()
    })

    it("uploads to basePath/latest.<extension>/ directory", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet/test-uuid-1234.parquet",
        expect.objectContaining({})
      )
    })

    it("uses serializer extension for file paths", async () => {
      mockSerialize.mockResolvedValue({
        buffer: new Uint8Array([5, 6, 7, 8]),
        extension: "orc",
      })

      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.orc/test-uuid-1234.orc",
        expect.objectContaining({})
      )
      expect(mockListPrefix).toHaveBeenCalledWith(
        "warehouse/analytics/users/latest.orc"
      )
    })

    it("recreates table with correct definition", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(mockRecreateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          catalog: "hive",
          schema: "analytics",
          tableName: "users",
          externalLocation:
            "s3a://my-bucket/warehouse/analytics/users/latest.parquet/",
          columns: expect.arrayContaining([
            { name: "name", type: "VARCHAR" },
            { name: "age", type: "BIGINT" },
          ]),
        }),
        expect.objectContaining({})
      )
    })

    it("never calls deletePrefix (old unsafe pattern removed)", async () => {
      mockListPrefix.mockResolvedValue([
        "warehouse/analytics/users/latest.parquet/old-file.parquet",
      ])

      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(mockDeletePrefix).not.toHaveBeenCalled()
    })

    it("calls serializer.serialize with records and schema", async () => {
      const records = [{ name: "Alice", age: 30 }]
      await executeWritePipeline({
        records,
        jsonSchema: baseJsonSchema,
        config: baseConfig,
      })

      expect(mockSerialize).toHaveBeenCalledWith(records, baseJsonSchema)
    })
  })

  describe("full_load_append strategy", () => {
    it("executes listPrefix → upload latest → upload all → recreateTablePair → deleteKeys in order", async () => {
      const callOrder: string[] = []
      mockListPrefix.mockImplementation(async () => {
        callOrder.push("listPrefix")
        return ["warehouse/analytics/users/latest.parquet/old-file.parquet"]
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
      mockDeleteKeys.mockImplementation(async () => {
        callOrder.push("deleteKeys")
      })

      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append" })
      )

      expect(callOrder).toStrictEqual([
        "listPrefix",
        "upload:latest",
        "upload:all",
        "recreateTablePair",
        "deleteKeys",
      ])
    })

    it("uploads to both latest.<ext>/ and all.<ext>/<partition_path>", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append" })
      )

      expect(mockUpload).toHaveBeenCalledTimes(2)
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet/test-uuid-1234.parquet",
        expect.objectContaining({})
      )
      // The all path includes partition path with our mocked UUID
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringMatching(
          /warehouse\/analytics\/users\/all\.parquet\/year=\d{4}\/month=\d{2}\/day=\d{2}\/test-uuid-1234\.parquet/u
        ),
        expect.objectContaining({})
      )
    })

    it("recreates table pair with _latest and _all table names", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append" })
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

    it("never calls deletePrefix (old unsafe pattern removed)", async () => {
      mockListPrefix.mockResolvedValue([
        "warehouse/analytics/users/latest.parquet/old-file.parquet",
      ])

      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append" })
      )

      expect(mockDeletePrefix).not.toHaveBeenCalled()
    })
  })

  describe("append strategy", () => {
    it("executes only upload → recreateTable (no delete, no latest)", async () => {
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
      expect(mockDeleteKeys).not.toHaveBeenCalled()
      expect(mockListPrefix).not.toHaveBeenCalled()
    })

    it("uploads to all.<ext>/<partition_path> only", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "append" }))

      expect(mockUpload).toHaveBeenCalledExactlyOnceWith(
        expect.any(Uint8Array),
        expect.stringMatching(
          /warehouse\/analytics\/users\/all\.parquet\/year=\d{4}\/month=\d{2}\/day=\d{2}\/test-uuid-1234\.parquet/u
        ),
        expect.objectContaining({})
      )
    })

    it("recreates single table pointing to all.<ext>/", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "append" }))

      expect(mockRecreateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "users",
          externalLocation:
            "s3a://my-bucket/warehouse/analytics/users/all.parquet/",
        }),
        expect.objectContaining({})
      )
    })

    it("does not upload to latest.<ext>", async () => {
      await executeWritePipeline(createInput({ loadStrategy: "append" }))

      const uploadCalls = mockUpload.mock.calls
      const latestCalls = uploadCalls.filter((call: unknown[]) =>
        (call[1] as string).includes("latest.")
      )
      expect(latestCalls).toHaveLength(0)
    })
  })

  describe("default load strategy", () => {
    it("defaults to full_load when loadStrategy is undefined", async () => {
      const callOrder: string[] = []
      mockListPrefix.mockImplementation(async () => {
        callOrder.push("listPrefix")
        return ["warehouse/analytics/users/latest.parquet/old-file.parquet"]
      })
      mockUpload.mockImplementation(async () => {
        callOrder.push("upload")
      })
      mockRecreateTable.mockImplementation(async () => {
        callOrder.push("recreateTable")
      })
      mockDeleteKeys.mockImplementation(async () => {
        callOrder.push("deleteKeys")
      })

      const input = createInput()
      // Explicitly remove loadStrategy to test default
      delete input.config.loadStrategy

      await executeWritePipeline(input)

      // Should behave like full_load
      expect(callOrder).toStrictEqual([
        "listPrefix",
        "upload",
        "recreateTable",
        "deleteKeys",
      ])
      expect(mockListPrefix).toHaveBeenCalledWith(
        "warehouse/analytics/users/latest.parquet"
      )
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "warehouse/analytics/users/latest.parquet/test-uuid-1234.parquet",
        expect.objectContaining({})
      )
    })
  })

  describe("fail-fast error propagation", () => {
    it("Serializer failure stops before storage operations", async () => {
      mockSerialize.mockRejectedValue(new Error("Serialization failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load" }))
      ).rejects.toThrow("Serialization failed")

      expect(mockListPrefix).not.toHaveBeenCalled()
      expect(mockUpload).not.toHaveBeenCalled()
      expect(mockRecreateTable).not.toHaveBeenCalled()
    })

    it("Storage listPrefix failure stops before upload and DDL", async () => {
      mockListPrefix.mockRejectedValue(new Error("Storage list failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load" }))
      ).rejects.toThrow("Storage list failed")

      expect(mockUpload).not.toHaveBeenCalled()
      expect(mockRecreateTable).not.toHaveBeenCalled()
    })

    it("Storage upload failure stops before DDL operations", async () => {
      mockUpload.mockRejectedValue(new Error("Storage upload failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load" }))
      ).rejects.toThrow("Storage upload failed")

      expect(mockRecreateTable).not.toHaveBeenCalled()
      expect(mockDeleteKeys).not.toHaveBeenCalled()
    })

    it("DDL failure propagates error in full_load and does not delete old files", async () => {
      mockListPrefix.mockResolvedValue([
        "warehouse/analytics/users/latest.parquet/old-file.parquet",
      ])
      mockRecreateTable.mockRejectedValue(new Error("DDL failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load" }))
      ).rejects.toThrow("DDL failed")

      expect(mockDeleteKeys).not.toHaveBeenCalled()
    })

    it("historical upload failure stops before DDL in full_load_append", async () => {
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
    it("DDL failure in full_load_append triggers rollback via recreateTablePair", async () => {
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

    it("DDL failure with partial rollback propagates error", async () => {
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

  describe("pipeline failure safety", () => {
    it("full_load with DDL failure → deleteKeys never called, old files preserved", async () => {
      mockListPrefix.mockResolvedValue([
        "warehouse/analytics/users/latest.parquet/old-file.parquet",
      ])
      mockUpload.mockResolvedValue()
      mockRecreateTable.mockRejectedValue(new Error("DDL failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load" }))
      ).rejects.toThrow("DDL failed")

      // Old files are never deleted when DDL fails
      expect(mockDeleteKeys).not.toHaveBeenCalled()
      expect(mockDeletePrefix).not.toHaveBeenCalled()
      // Upload did happen (before DDL)
      expect(mockUpload).toHaveBeenCalledOnce()
    })

    it("full_load with upload failure → no DDL attempted, no delete operations", async () => {
      mockListPrefix.mockResolvedValue([
        "warehouse/analytics/users/latest.parquet/old-file.parquet",
      ])
      mockUpload.mockRejectedValue(new Error("Upload failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load" }))
      ).rejects.toThrow("Upload failed")

      // No DDL or delete operations attempted
      expect(mockRecreateTable).not.toHaveBeenCalled()
      expect(mockDeleteKeys).not.toHaveBeenCalled()
      expect(mockDeletePrefix).not.toHaveBeenCalled()
    })

    it("full_load_append with DDL failure → old latest files preserved", async () => {
      mockListPrefix.mockResolvedValue([
        "warehouse/analytics/users/latest.parquet/old-latest.parquet",
      ])
      mockUpload.mockResolvedValue()
      mockRecreateTablePair.mockRejectedValue(new Error("DDL failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load_append" }))
      ).rejects.toThrow("DDL failed")

      // Old latest files are never deleted when DDL fails
      expect(mockDeleteKeys).not.toHaveBeenCalled()
      expect(mockDeletePrefix).not.toHaveBeenCalled()
      // Both uploads did happen (latest + all)
      expect(mockUpload).toHaveBeenCalledTimes(2)
    })

    it("full_load_append with upload failure → no DDL, no delete", async () => {
      mockListPrefix.mockResolvedValue([])
      mockUpload.mockRejectedValue(new Error("Upload failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "full_load_append" }))
      ).rejects.toThrow("Upload failed")

      // No DDL or delete operations when upload fails
      expect(mockRecreateTablePair).not.toHaveBeenCalled()
      expect(mockDeleteKeys).not.toHaveBeenCalled()
      expect(mockDeletePrefix).not.toHaveBeenCalled()
    })

    it("append with DDL failure → uploaded file remains, no deletes", async () => {
      mockUpload.mockResolvedValue()
      mockRecreateTable.mockRejectedValue(new Error("DDL failed"))

      await expect(
        executeWritePipeline(createInput({ loadStrategy: "append" }))
      ).rejects.toThrow("DDL failed")

      // Upload happened before DDL
      expect(mockUpload).toHaveBeenCalledOnce()
      // No delete operations in append strategy, even on failure
      expect(mockDeleteKeys).not.toHaveBeenCalled()
      expect(mockDeletePrefix).not.toHaveBeenCalled()
    })
  })

  describe("serializer extension usage", () => {
    it("uses serializer extension in full_load_append paths", async () => {
      mockSerialize.mockResolvedValue({
        buffer: new Uint8Array([1, 2, 3]),
        extension: "avro",
        contentType: "application/avro",
      })

      await executeWritePipeline(
        createInput({ loadStrategy: "full_load_append" })
      )

      // Latest path uses the extension
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringContaining("latest.avro/test-uuid-1234.avro"),
        expect.objectContaining({})
      )
      // All path uses the extension
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringMatching(
          /all\.avro\/year=\d{4}\/month=\d{2}\/day=\d{2}\/test-uuid-1234\.avro/u
        ),
        expect.objectContaining({})
      )
    })

    it("uses serializer extension in append paths", async () => {
      mockSerialize.mockResolvedValue({
        buffer: new Uint8Array([1, 2, 3]),
        extension: "orc",
      })

      await executeWritePipeline(createInput({ loadStrategy: "append" }))

      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringMatching(
          /all\.orc\/year=\d{4}\/month=\d{2}\/day=\d{2}\/test-uuid-1234\.orc/u
        ),
        expect.objectContaining({})
      )
      expect(mockRecreateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          externalLocation: expect.stringContaining("all.orc/"),
        }),
        expect.objectContaining({})
      )
    })
  })

  describe("contentType forwarding", () => {
    it("forwards serializer contentType to upload", async () => {
      mockSerialize.mockResolvedValue({
        buffer: new Uint8Array([1, 2, 3, 4]),
        extension: "parquet",
        contentType: "application/vnd.apache.parquet",
      })

      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.any(String),
        { contentType: "application/vnd.apache.parquet" }
      )
    })

    it("passes contentType undefined when the serializer omits it", async () => {
      mockSerialize.mockResolvedValue({
        buffer: new Uint8Array([1, 2, 3, 4]),
        extension: "orc",
      })

      await executeWritePipeline(createInput({ loadStrategy: "full_load" }))

      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.any(String),
        { contentType: undefined }
      )
    })
  })

  describe("keepShadowTables forwarding", () => {
    it("forwards keepShadowTables to recreateTable as a per-call option", async () => {
      await executeWritePipeline(
        createInput({ loadStrategy: "full_load", keepShadowTables: true })
      )

      expect(mockRecreateTable).toHaveBeenCalledWith(expect.anything(), {
        keepShadowTables: true,
      })
    })

    it("forwards keepShadowTables to recreateTablePair as a per-call option", async () => {
      await executeWritePipeline(
        createInput({
          loadStrategy: "full_load_append",
          keepShadowTables: false,
        })
      )

      expect(mockRecreateTablePair).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { keepShadowTables: false }
      )
    })
  })
})
