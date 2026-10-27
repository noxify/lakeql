import { Files } from "files-sdk"
// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable typescript/no-explicit-any
// oxlint-disable unicorn/no-useless-undefined
import { describe, expect, vi, beforeEach, it } from "vitest"

import {
  createStorageOperations,
  StorageError,
} from "../src/storage-operations"

// oxlint-disable vitest/prefer-import-in-mock -- vi.mock factories use inline definitions per project convention

// Mock files-sdk
const mockListAll = vi.fn()
const mockDelete = vi.fn()
const mockUpload = vi.fn()

vi.mock("files-sdk", () => ({
  Files: class MockFiles {
    listAll = mockListAll
    delete = mockDelete
    upload = mockUpload
  },
}))

describe("StorageOperations", () => {
  let files: Files

  beforeEach(() => {
    vi.clearAllMocks()
    files = new Files({ adapter: {} as any })
  })

  describe(createStorageOperations, () => {
    it("accepts a Files instance directly", () => {
      const ops = createStorageOperations(files)
      expect(ops).toBeDefined()
      expect(ops.upload).toBeTypeOf("function")
      expect(ops.deletePrefix).toBeTypeOf("function")
      expect(ops.listPrefix).toBeTypeOf("function")
      expect(ops.deleteKeys).toBeTypeOf("function")
    })
  })

  describe("listPrefix", () => {
    it("returns all keys under a prefix", async () => {
      const items = [
        { key: "data/latest.parquet/file1.parquet" },
        { key: "data/latest.parquet/file2.parquet" },
        { key: "data/latest.parquet/file3.parquet" },
      ]

      mockListAll.mockReturnValue(items)

      const ops = createStorageOperations(files)
      const result = await ops.listPrefix("data/latest.parquet")

      expect(result).toStrictEqual([
        "data/latest.parquet/file1.parquet",
        "data/latest.parquet/file2.parquet",
        "data/latest.parquet/file3.parquet",
      ])
      expect(mockListAll).toHaveBeenCalledWith({
        prefix: "data/latest.parquet",
      })
    })

    it("returns empty array when no objects exist", async () => {
      mockListAll.mockReturnValue([])

      const ops = createStorageOperations(files)
      const result = await ops.listPrefix("data/empty-prefix")

      expect(result).toStrictEqual([])
      expect(mockListAll).toHaveBeenCalledWith({ prefix: "data/empty-prefix" })
    })

    it("throws StorageError on failure", async () => {
      // oxlint-disable-next-line eslint/require-yield
      mockListAll.mockImplementation(function* failingGenerator() {
        throw new Error("Network timeout")
      })

      const ops = createStorageOperations(files)

      await expect(ops.listPrefix("data/failing")).rejects.toThrow(StorageError)
      await expect(ops.listPrefix("data/failing")).rejects.toThrow(
        'Storage list failed for "data/failing": Network timeout'
      )

      try {
        await ops.listPrefix("data/failing")
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).path).toBe("data/failing")
        expect((error as StorageError).operation).toBe("list")
      }
    })
  })

  describe("upload", () => {
    it("uploads a buffer to the given path without options", async () => {
      mockUpload.mockResolvedValue(undefined)

      const ops = createStorageOperations(files)
      const buffer = new Uint8Array([1, 2, 3])

      await expect(
        ops.upload(buffer, "data/file.parquet")
      ).resolves.toBeUndefined()
      expect(mockUpload).toHaveBeenCalledWith(
        "data/file.parquet",
        buffer,
        undefined
      )
    })

    it("forwards contentType to files-sdk when provided", async () => {
      mockUpload.mockResolvedValue(undefined)

      const ops = createStorageOperations(files)
      const buffer = new Uint8Array([1, 2, 3])

      await ops.upload(buffer, "data/file.parquet", {
        contentType: "application/vnd.apache.parquet",
      })

      expect(mockUpload).toHaveBeenCalledWith("data/file.parquet", buffer, {
        contentType: "application/vnd.apache.parquet",
      })
    })

    it("omits options when contentType is undefined", async () => {
      mockUpload.mockResolvedValue(undefined)

      const ops = createStorageOperations(files)
      const buffer = new Uint8Array([1, 2, 3])

      await ops.upload(buffer, "data/file.parquet", { contentType: undefined })

      expect(mockUpload).toHaveBeenCalledWith(
        "data/file.parquet",
        buffer,
        undefined
      )
    })

    it("throws StorageError on failure", async () => {
      mockUpload.mockRejectedValue(new Error("Upload failed"))

      const ops = createStorageOperations(files)
      const buffer = new Uint8Array([1, 2, 3])

      await expect(ops.upload(buffer, "data/file.parquet")).rejects.toThrow(
        StorageError
      )
      await expect(ops.upload(buffer, "data/file.parquet")).rejects.toThrow(
        'Storage upload failed for "data/file.parquet": Upload failed'
      )

      try {
        await ops.upload(buffer, "data/file.parquet")
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).path).toBe("data/file.parquet")
        expect((error as StorageError).operation).toBe("upload")
      }
    })
  })

  describe("deleteKeys", () => {
    it("with valid keys succeeds", async () => {
      mockDelete.mockResolvedValue(undefined)

      const ops = createStorageOperations(files)
      const keys = ["data/file1.parquet", "data/file2.parquet"]

      await expect(ops.deleteKeys(keys)).resolves.toBeUndefined()
      expect(mockDelete).toHaveBeenCalledWith(keys)
    })

    it("with empty array completes without operations", async () => {
      const ops = createStorageOperations(files)

      await expect(ops.deleteKeys([])).resolves.toBeUndefined()
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it("throws StorageError on failure (no partial deletes)", async () => {
      mockDelete.mockRejectedValue(new Error("Access denied"))

      const ops = createStorageOperations(files)
      const keys = ["data/file1.parquet", "data/file2.parquet"]

      await expect(ops.deleteKeys(keys)).rejects.toThrow(StorageError)
      await expect(ops.deleteKeys(keys)).rejects.toThrow(
        'Storage delete failed for "data/file1.parquet, data/file2.parquet": Access denied'
      )

      try {
        await ops.deleteKeys(keys)
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).path).toBe(
          "data/file1.parquet, data/file2.parquet"
        )
        expect((error as StorageError).operation).toBe("delete")
      }
    })

    it("throws StorageError for invalid keys without calling delete", async () => {
      const ops = createStorageOperations(files)

      await expect(ops.deleteKeys(["valid-key", ""])).rejects.toThrow(
        StorageError
      )
      await expect(ops.deleteKeys(["valid-key", ""])).rejects.toThrow(
        "Invalid key: keys must be non-empty strings"
      )
      expect(mockDelete).not.toHaveBeenCalled()

      await expect(ops.deleteKeys(["  "])).rejects.toThrow(StorageError)
      expect(mockDelete).not.toHaveBeenCalled()
    })
  })

  describe("deletePrefix", () => {
    it("deletes all objects under a prefix", async () => {
      const items = [
        { key: "data/file1.parquet" },
        { key: "data/file2.parquet" },
      ]

      mockListAll.mockReturnValue(items)
      mockDelete.mockResolvedValue(undefined)

      const ops = createStorageOperations(files)
      await ops.deletePrefix("data/")

      expect(mockListAll).toHaveBeenCalledWith({ prefix: "data/" })
      expect(mockDelete).toHaveBeenCalledWith([
        "data/file1.parquet",
        "data/file2.parquet",
      ])
    })

    it("does not call delete when no objects exist under prefix", async () => {
      mockListAll.mockReturnValue([])

      const ops = createStorageOperations(files)
      await ops.deletePrefix("empty/")

      expect(mockListAll).toHaveBeenCalledWith({ prefix: "empty/" })
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it("throws StorageError on failure", async () => {
      // oxlint-disable-next-line eslint/require-yield
      mockListAll.mockImplementation(function* failingGenerator() {
        throw new Error("List failed")
      })

      const ops = createStorageOperations(files)

      await expect(ops.deletePrefix("data/")).rejects.toThrow(StorageError)
      await expect(ops.deletePrefix("data/")).rejects.toThrow(
        'Storage delete failed for "data/": List failed'
      )

      try {
        await ops.deletePrefix("data/")
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError)
        expect((error as StorageError).path).toBe("data/")
        expect((error as StorageError).operation).toBe("delete")
      }
    })
  })
})
