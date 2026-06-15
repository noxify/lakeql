import { Files } from "files-sdk"
import { s3 } from "files-sdk/s3"

/**
 * S3-compatible storage configuration.
 */
export interface S3Config {
  /** S3 bucket name. */
  bucket: string
  /** AWS region or S3-compatible endpoint region. */
  region: string
  /** Optional custom endpoint for S3-compatible storage. */
  endpoint?: string
  /** Access credentials. */
  credentials: {
    accessKeyId: string
    secretAccessKey: string
  }
}

/**
 * Storage operations interface for S3-compatible object stores.
 */
export interface StorageOperations {
  /**
   * Uploads a file buffer to the specified S3 path.
   * @throws {StorageError} with context if upload fails
   */
  upload: (buffer: Uint8Array, targetPath: string) => Promise<void>

  /**
   * Deletes all objects under the given prefix.
   * @throws {StorageError} with context if deletion fails
   */
  deletePrefix: (prefix: string) => Promise<void>
}

/**
 * Error class for storage operation failures, providing path and operation context.
 */
export class StorageError extends Error {
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
}

/**
 * Creates storage operations backed by files-sdk.
 */
export function createStorageOperations(config: S3Config): StorageOperations {
  const files = new Files({
    adapter: s3({
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint,
      credentials: config.credentials,
    }),
  })

  return {
    async upload(buffer: Uint8Array, targetPath: string): Promise<void> {
      try {
        await files.upload(targetPath, buffer)
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
  }
}
