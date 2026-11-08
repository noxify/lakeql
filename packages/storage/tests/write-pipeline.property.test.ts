// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects
// oxlint-disable vitest/prefer-import-in-mock -- vi.mock factories use inline definitions per project convention

import type { JsonSchema } from "@lakeql/parquet"
import fc from "fast-check"
import { describe, expect, it, vi, beforeEach } from "vitest"

import type { Serializer, SerializerOutput } from "../src/serializer/types"
import type { StorageOperations } from "../src/storage-operations"

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

let uuidCounter = 0
vi.mock("node:crypto", async () => ({
  default: {
    randomUUID: () => {
      uuidCounter += 1
      const hex = uuidCounter.toString(16).padStart(12, "0")
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4000-8000-${hex.padStart(12, "0")}`
    },
  },
}))

// oxlint-disable-next-line import/first -- vi.mock must precede imports per vitest design
import {
  generatePartitionPath,
  executeWritePipeline,
} from "../src/write-pipeline"
// oxlint-disable-next-line import/first -- vi.mock must precede imports per vitest design
import type { WritePipelineInput } from "../src/write-pipeline"

// --- Partition Path Format ---

describe("Partition Path Format", () => {
  const UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

  const PARTITION_PATH_REGEX =
    /^year=(?<year>\d{4})\/month=(?<month>\d{2})\/day=(?<day>\d{2})\/(?<uuid>[0-9a-f-]+)\.parquet$/u

  it("generates paths matching year=YYYY/month=MM/day=DD/<uuid>.parquet format", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("1000-01-01T00:00:00.000Z"),
          max: new Date("9999-12-31T23:59:59.999Z"),
          noInvalidDate: true,
        }),
        (date) => {
          const path = generatePartitionPath(date)

          // Assert overall format matches
          const match = path.match(PARTITION_PATH_REGEX)
          expect(match).not.toBeNull()

          if (!match?.groups) {
            return
          }

          const {
            year: yearStr,
            month: monthStr,
            day: dayStr,
            uuid: uuidStr,
          } = match.groups

          // Assert year, month, day correspond to UTC values of the input date
          const expectedYear = date.getUTCFullYear().toString()
          const expectedMonth = (date.getUTCMonth() + 1)
            .toString()
            .padStart(2, "0")
          const expectedDay = date.getUTCDate().toString().padStart(2, "0")

          expect(yearStr).toBe(expectedYear)
          expect(monthStr).toBe(expectedMonth)
          expect(dayStr).toBe(expectedDay)

          // Assert month and day are zero-padded (always 2 digits)
          expect(monthStr).toHaveLength(2)
          expect(dayStr).toHaveLength(2)

          // Assert the UUID portion is a valid UUID v4 format
          expect(uuidStr).toMatch(UUID_V4_REGEX)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// --- S3 deletion ordering ---

/**
 * For any `executeWritePipeline` execution with `full_load` or `full_load_append`
 * strategy, `deleteKeys` is never called unless both the upload and the DDL
 * operation have already completed successfully.
 */
describe("S3 deletion ordering", () => {
  // --- Arbitraries ---

  /**
   * Generates a non-empty array of simple records with string keys.
   */
  const recordsArb = fc.array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      age: fc.integer({ min: 0, max: 150 }),
    }),
    { minLength: 1, maxLength: 5 }
  )

  const jsonSchema: JsonSchema = {
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

  /**
   * Generates a load strategy from the relevant set (full_load or full_load_append).
   */
  const strategyArb = fc.constantFrom(
    "full_load" as const,
    "full_load_append" as const
  )

  beforeEach(() => {
    vi.clearAllMocks()
    uuidCounter = 0
    mockSerialize.mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3, 4]),
      extension: "parquet",
      contentType: "application/vnd.apache.parquet",
    })
    mockUpload.mockResolvedValue()
    mockDeletePrefix.mockResolvedValue()
    mockListPrefix.mockResolvedValue([
      "warehouse/analytics/users/latest.parquet/old-file.parquet",
    ])
    mockDeleteKeys.mockResolvedValue()
    mockRecreateTable.mockResolvedValue()
    mockRecreateTablePair.mockResolvedValue()
  })

  it("deleteKeys is only called after both upload and DDL succeed (for any records and strategy)", async () => {
    await fc.assert(
      fc.asyncProperty(recordsArb, strategyArb, async (records, strategy) => {
        vi.clearAllMocks()
        uuidCounter = 0
        mockSerialize.mockResolvedValue({
          buffer: new Uint8Array([1, 2, 3, 4]),
          extension: "parquet",
          contentType: "application/vnd.apache.parquet",
        })

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
        mockRecreateTablePair.mockImplementation(async () => {
          callOrder.push("recreateTablePair")
        })
        mockDeleteKeys.mockImplementation(async () => {
          callOrder.push("deleteKeys")
        })

        await executeWritePipeline({
          records,
          jsonSchema,
          config: { ...baseConfig, loadStrategy: strategy },
        })

        // deleteKeys must only appear after both an upload and a DDL call
        const deleteKeysIndex = callOrder.indexOf("deleteKeys")
        if (deleteKeysIndex !== -1) {
          const hasUploadBefore = callOrder
            .slice(0, deleteKeysIndex)
            .includes("upload")
          const hasDdlBefore =
            callOrder.slice(0, deleteKeysIndex).includes("recreateTable") ||
            callOrder.slice(0, deleteKeysIndex).includes("recreateTablePair")

          // oxlint-disable-next-line vitest/no-conditional-expect
          expect(hasUploadBefore).toBeTruthy()
          // oxlint-disable-next-line vitest/no-conditional-expect
          expect(hasDdlBefore).toBeTruthy()
        }
      }),
      { numRuns: 50 }
    )
  })

  it("deleteKeys is never called when DDL fails (for any records and strategy)", async () => {
    await fc.assert(
      fc.asyncProperty(recordsArb, strategyArb, async (records, strategy) => {
        vi.clearAllMocks()
        uuidCounter = 0
        mockSerialize.mockResolvedValue({
          buffer: new Uint8Array([1, 2, 3, 4]),
          extension: "parquet",
          contentType: "application/vnd.apache.parquet",
        })

        mockListPrefix.mockResolvedValue([
          "warehouse/analytics/users/latest.parquet/old-file.parquet",
        ])
        mockUpload.mockResolvedValue()
        mockRecreateTable.mockRejectedValue(new Error("DDL failure"))
        mockRecreateTablePair.mockRejectedValue(new Error("DDL failure"))

        try {
          await executeWritePipeline({
            records,
            jsonSchema,
            config: { ...baseConfig, loadStrategy: strategy },
          })
        } catch {
          // Expected to throw
        }

        // deleteKeys must NEVER be called when DDL fails
        expect(mockDeleteKeys).not.toHaveBeenCalled()
      }),
      { numRuns: 50 }
    )
  })

  it("deleteKeys is never called when upload fails (for any records and strategy)", async () => {
    await fc.assert(
      fc.asyncProperty(recordsArb, strategyArb, async (records, strategy) => {
        vi.clearAllMocks()
        uuidCounter = 0
        mockSerialize.mockResolvedValue({
          buffer: new Uint8Array([1, 2, 3, 4]),
          extension: "parquet",
          contentType: "application/vnd.apache.parquet",
        })

        mockListPrefix.mockResolvedValue([
          "warehouse/analytics/users/latest.parquet/old-file.parquet",
        ])
        mockUpload.mockRejectedValue(new Error("Upload failure"))

        try {
          await executeWritePipeline({
            records,
            jsonSchema,
            config: { ...baseConfig, loadStrategy: strategy },
          })
        } catch {
          // Expected to throw
        }

        // deleteKeys must NEVER be called when upload fails
        expect(mockDeleteKeys).not.toHaveBeenCalled()
        // DDL must also never be attempted when upload fails
        expect(mockRecreateTable).not.toHaveBeenCalled()
        expect(mockRecreateTablePair).not.toHaveBeenCalled()
      }),
      { numRuns: 50 }
    )
  })
})
