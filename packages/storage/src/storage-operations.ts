import type { Files } from "files-sdk"

/**
 * Optional metadata for an upload operation.
 */
export interface UploadOptions {
  /**
   * MIME type stored with the object. Only forwarded to the underlying
   * storage when set; omitted uploads keep the previous behavior.
   */
  contentType?: string
}

/**
 * Storage operations interface for object stores via files-sdk.
 */
export interface StorageOperations {
  /**
   * Uploads a file buffer to the specified path.
   *
   * @param buffer - The bytes to upload.
   * @param targetPath - Destination object key/path.
   * @param options - Optional upload metadata (e.g. `contentType`).
   * @throws {StorageError} with context if upload fails
   */
  upload: (
    buffer: Uint8Array,
    targetPath: string,
    options?: UploadOptions
  ) => Promise<void>

  /**
   * Deletes all objects under the given prefix.
   * @throws {StorageError} with context if deletion fails
   */
  deletePrefix: (prefix: string) => Promise<void>

  /**
   * Lists all object keys under a given prefix.
   * @throws {StorageError} with context if listing fails
   */
  listPrefix: (prefix: string) => Promise<string[]>

  /**
   * Deletes specific object keys. Fails fast if any key is invalid or non-existent —
   * no keys are deleted on failure (atomic: all-or-nothing).
   * Returns immediately without issuing operations when called with an empty array.
   * @throws {StorageError} with context if deletion fails
   */
  deleteKeys: (keys: string[]) => Promise<void>
}

/**
 * Error class for storage operation failures, providing path and operation context.
 */
export class StorageError extends Error {
  public readonly path: string
  public readonly operation: "upload" | "delete" | "list"

  constructor(
    message: string,
    path: string,
    operation: "upload" | "delete" | "list",
    options?: ErrorOptions
  ) {
    super(`Storage ${operation} failed for "${path}": ${message}`, options)
    this.name = "StorageError"
    this.path = path
    this.operation = operation
  }
}

/**
 * Creates storage operations backed by a user-provided files-sdk instance.
 *
 * The caller is responsible for constructing the `Files` instance with the
 * appropriate adapter (S3, MinIO, GCS, Azure, etc.) and credentials.
 */
export function createStorageOperations(files: Files): StorageOperations {
  return {
    async upload(
      buffer: Uint8Array,
      targetPath: string,
      options?: UploadOptions
    ): Promise<void> {
      try {
        await files.upload(
          targetPath,
          buffer,
          options?.contentType === undefined
            ? undefined
            : { contentType: options.contentType }
        )
      } catch (error) {
        throw new StorageError(
          error instanceof Error ? error.message : String(error),
          targetPath,
          "upload",
          { cause: error }
        )
      }
    },

    async deletePrefix(prefix: string): Promise<void> {
      try {
        const keys: string[] = []
        for await (const file of files.listAll({ prefix })) {
          keys.push(file.key)
        }
        if (keys.length > 0) {
          await files.delete(keys)
        }
      } catch (error) {
        if (error instanceof StorageError) {
          throw error
        }
        throw new StorageError(
          error instanceof Error ? error.message : String(error),
          prefix,
          "delete",
          { cause: error }
        )
      }
    },

    async listPrefix(prefix: string): Promise<string[]> {
      try {
        const keys: string[] = []
        for await (const file of files.listAll({ prefix })) {
          keys.push(file.key)
        }
        return keys
      } catch (error) {
        if (error instanceof StorageError) {
          throw error
        }
        throw new StorageError(
          error instanceof Error ? error.message : String(error),
          prefix,
          "list",
          { cause: error }
        )
      }
    },

    async deleteKeys(keys: string[]): Promise<void> {
      if (keys.length === 0) {
        return
      }

      for (const key of keys) {
        if (typeof key !== "string" || key.trim() === "") {
          throw new StorageError(
            "Invalid key: keys must be non-empty strings",
            key ?? "",
            "delete"
          )
        }
      }

      try {
        await files.delete(keys)
      } catch (error) {
        if (error instanceof StorageError) {
          throw error
        }
        throw new StorageError(
          error instanceof Error ? error.message : String(error),
          keys.join(", "),
          "delete",
          { cause: error }
        )
      }
    },
  }
}
