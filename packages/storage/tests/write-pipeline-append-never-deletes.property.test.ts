// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects
// oxlint-disable vitest/prefer-import-in-mock -- vi.mock factories use inline definitions per project convention

import type { JsonSchema } from "@lakeql/parquet"
import fc from "fast-check"
import { describe, expect, it, vi, beforeEach } from "vitest"

import type { Serializer, SerializerOutput } from "../src/serializer/types"
import type { StorageOperations } from "../src/storage-operations"

// Mock crypto.randomUUID for deterministic partition paths
vi.mock("node:crypto", async () => ({
  default: {
    randomUUID: () => "test-uuid-1234",
  },
}))

// oxlint-disable-next-line import/first -- vi.mock must precede imports per vitest design
import { executeWritePipeline } from "../src/write-pipeline"
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
const mockRecreateTable = vi.fn<() => Promise<void>>()
const mockRecreateTablePair = vi.fn<() => Promise<void>>()

const mockTableManager = {
  createTable: vi.fn<() => Promise<void>>(),
  dropTable: vi.fn<() => Promise<void>>(),
  recreateTable: mockRecreateTable,
  recreateTablePair: mockRecreateTablePair,
  buildExternalLocation: (path: string) => `s3a://my-bucket/${path}`,
}

// --- Test fixtures ---

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

// --- Append never deletes ---

describe("Append never deletes", () => {
  /**
   * For any `executeWritePipeline` execution with `append` strategy, no S3
   * deletion operations (`deletePrefix` or `deleteKeys`) are ever invoked,
   * regardless of whether the pipeline succeeds or fails.
   */

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

  /**
   * Arbitrary for partitioning configurations relevant to append mode.
   * Covers: disabled, timestamp, field-based, and custom partitioning.
   */
  const partitioningConfigArb = fc.oneof(
    // disabled
    fc.record({
      partitioning: fc.constant(false as const),
      partitioningFormat: fc.constantFrom(
        "year" as const,
        "year/month" as const,
        "year/month/day" as const
      ),
    }),
    // timestamp (default)
    fc.record({
      partitioning: fc.constant(true as const),
      partitioningFormat: fc.constantFrom(
        "year" as const,
        "year/month" as const,
        "year/month/day" as const
      ),
    }),
    // field-based (using "event_date" as field name)
    fc.record({
      partitioning: fc.constant("event_date"),
      partitioningFormat: fc.constantFrom(
        "year" as const,
        "year/month" as const,
        "year/month/day" as const
      ),
    }),
    // custom format (field:component style)
    fc.record({
      partitioning: fc.constant("event_date:year/event_date:month"),
      partitioningFormat: fc.constant("year/month/day" as const),
    })
  )

  it("append with DDL success never calls deleteKeys or deletePrefix for any partitioning mode", async () => {
    await fc.assert(
      fc.asyncProperty(partitioningConfigArb, async (partConfig) => {
        // Reset mocks for each iteration
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

        const records =
          partConfig.partitioning === "event_date" ||
          (typeof partConfig.partitioning === "string" &&
            partConfig.partitioning.includes(":"))
            ? [{ name: "Alice", age: 30, event_date: "2024-06-15T10:00:00Z" }]
            : [{ name: "Alice", age: 30 }]

        const input: WritePipelineInput = {
          records,
          jsonSchema: baseJsonSchema,
          config: {
            ...baseConfig,
            loadStrategy: "append",
            partitioning: partConfig.partitioning,
            partitioningFormat: partConfig.partitioningFormat,
          },
        }

        await executeWritePipeline(input)

        expect(mockDeleteKeys).not.toHaveBeenCalled()
        expect(mockDeletePrefix).not.toHaveBeenCalled()
        expect(mockListPrefix).not.toHaveBeenCalled()
      }),
      { numRuns: 50 }
    )
  })

  it("append with DDL failure never calls deleteKeys or deletePrefix", async () => {
    await fc.assert(
      fc.asyncProperty(partitioningConfigArb, async (partConfig) => {
        // Reset mocks for each iteration
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
        mockRecreateTable.mockRejectedValue(new Error("DDL failed"))

        const records =
          partConfig.partitioning === "event_date" ||
          (typeof partConfig.partitioning === "string" &&
            partConfig.partitioning.includes(":"))
            ? [{ name: "Alice", age: 30, event_date: "2024-06-15T10:00:00Z" }]
            : [{ name: "Alice", age: 30 }]

        const input: WritePipelineInput = {
          records,
          jsonSchema: baseJsonSchema,
          config: {
            ...baseConfig,
            loadStrategy: "append",
            partitioning: partConfig.partitioning,
            partitioningFormat: partConfig.partitioningFormat,
          },
        }

        try {
          await executeWritePipeline(input)
        } catch {
          // Expected to throw — DDL failed
        }

        expect(mockDeleteKeys).not.toHaveBeenCalled()
        expect(mockDeletePrefix).not.toHaveBeenCalled()
        expect(mockListPrefix).not.toHaveBeenCalled()
      }),
      { numRuns: 50 }
    )
  })

  it("append with upload failure never calls deleteKeys or deletePrefix", async () => {
    await fc.assert(
      fc.asyncProperty(partitioningConfigArb, async (partConfig) => {
        // Reset mocks for each iteration
        vi.clearAllMocks()
        mockSerialize.mockResolvedValue({
          buffer: new Uint8Array([1, 2, 3, 4]),
          extension: "parquet",
          contentType: "application/vnd.apache.parquet",
        })
        mockUpload.mockRejectedValue(new Error("Upload failed"))
        mockDeletePrefix.mockResolvedValue()
        mockListPrefix.mockResolvedValue([])
        mockDeleteKeys.mockResolvedValue()
        mockRecreateTable.mockResolvedValue()

        const records =
          partConfig.partitioning === "event_date" ||
          (typeof partConfig.partitioning === "string" &&
            partConfig.partitioning.includes(":"))
            ? [{ name: "Alice", age: 30, event_date: "2024-06-15T10:00:00Z" }]
            : [{ name: "Alice", age: 30 }]

        const input: WritePipelineInput = {
          records,
          jsonSchema: baseJsonSchema,
          config: {
            ...baseConfig,
            loadStrategy: "append",
            partitioning: partConfig.partitioning,
            partitioningFormat: partConfig.partitioningFormat,
          },
        }

        try {
          await executeWritePipeline(input)
        } catch {
          // Expected to throw — upload failed
        }

        expect(mockDeleteKeys).not.toHaveBeenCalled()
        expect(mockDeletePrefix).not.toHaveBeenCalled()
        expect(mockListPrefix).not.toHaveBeenCalled()
      }),
      { numRuns: 50 }
    )
  })
})
