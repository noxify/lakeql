import { Files } from "files-sdk"
import { minio } from "files-sdk/minio"
import { s3 } from "files-sdk/s3"

/**
 * Supported storage adapter types.
 */
export type StorageType = "s3" | "minio"

/**
 * Storage configuration for S3 or MinIO adapters.
 *
 * Credentials are read internally from environment variables:
 * - S3: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION, AWS_ENDPOINT_URL
 * - MinIO: MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY, requires explicit endpoint
 */
export interface StorageConfig {
  /**
   * Storage adapter type.
   * @default "s3"
   */
  type: StorageType
  /** Bucket name. */
  bucket: string
  /** Region override. Falls back to AWS_DEFAULT_REGION env var for S3. */
  region?: string
  /** Custom endpoint. Required for MinIO, optional for S3 (falls back to AWS_ENDPOINT_URL env var). */
  endpoint?: string
}

/**
 * @deprecated Use StorageConfig instead.
 */
export type S3Config = StorageConfig

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
 * Adapter selection is based on config.type:
 * - "s3": reads credentials from AWS_* environment variables
 * - "minio": reads credentials from MINIO_* environment variables
 */
export function createStorageOperations(
  config: StorageConfig
): StorageOperations {
  const storageType = config.type ?? "s3"

  let files: Files

  if (storageType === "minio") {
    /* eslint-disable no-restricted-properties -- adapters package reads MinIO env vars directly */
    const endpoint = config.endpoint ?? process.env.MINIO_ENDPOINT
    const accessKeyId = process.env.MINIO_ACCESS_KEY_ID
    const secretAccessKey = process.env.MINIO_SECRET_ACCESS_KEY
    /* eslint-enable no-restricted-properties */

    if (!endpoint) {
      throw new Error(
        "MinIO adapter requires an endpoint. Set config.endpoint or MINIO_ENDPOINT env var."
      )
    }

    files = new Files({
      adapter: minio({
        bucket: config.bucket,
        region: config.region,
        endpoint,
        accessKeyId,
        secretAccessKey,
      }),
    })
  } else {
    /* eslint-disable no-restricted-properties -- adapters package reads AWS standard env vars directly */
    const region = config.region ?? process.env.AWS_DEFAULT_REGION
    const endpoint = config.endpoint ?? process.env.AWS_ENDPOINT_URL
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
    /* eslint-enable no-restricted-properties */

    files = new Files({
      adapter: s3({
        bucket: config.bucket,
        region,
        endpoint,
        credentials:
          accessKeyId && secretAccessKey
            ? { accessKeyId, secretAccessKey }
            : undefined,
      }),
    })
  }

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
