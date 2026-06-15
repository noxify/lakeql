import crypto from "node:crypto"

import { writeParquet } from "@lakeql/parquet"
import type { JsonSchema } from "@lakeql/parquet"
import type { TrinoClient } from "@lakeql/trino-client"

import { createHiveTableManager } from "./hive-table-manager"
import type { HiveTableDefinition } from "./hive-table-manager"
import { createStorageOperations } from "./storage-operations"
import type { StorageConfig, StorageType } from "./storage-operations"

/**
 * Load strategy determines how data is stored and how Hive tables are managed.
 */
export type LoadStrategy = "full_load" | "full_load_append" | "append"

/**
 * Configuration for the write pipeline.
 */
export interface WritePipelineConfig {
  /** The load strategy for this endpoint. Defaults to "full_load". */
  loadStrategy?: LoadStrategy
  /** Storage adapter type. Defaults to "s3". */
  type?: StorageType
  /** Bucket name for storing Parquet files. */
  bucket: string
  /** The base path for storing Parquet files. */
  basePath: string
  /** Optional region override. */
  region?: string
  /** Optional custom endpoint for S3-compatible storage. */
  endpoint?: string
  /** Hive table definition for DDL management. */
  table: {
    catalog: string
    schema: string
    tableName: string
  }
  /** The Trino client instance for DDL operations. */
  trinoClient: TrinoClient
}

/**
 * Input for the write pipeline execution.
 */
export interface WritePipelineInput {
  /** The records to persist. Accepts any array of objects with string keys. */
  // biome-ignore lint: Records from GraphQL input types have optional/nullable properties
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  records: Record<string, any>[]
  /** The JSON Schema describing the record structure. */
  jsonSchema: JsonSchema
  /** Pipeline configuration. */
  config: WritePipelineConfig
}

/**
 * Generates a partition path based on the current date.
 * Format: year=YYYY/month=MM/day=DD/<uuid>.parquet
 */
export function generatePartitionPath(date: Date = new Date()): string {
  const year = date.getUTCFullYear().toString()
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = date.getUTCDate().toString().padStart(2, "0")
  const uuid = crypto.randomUUID()

  return `year=${year}/month=${month}/day=${day}/${uuid}.parquet`
}

/**
 * Derives Hive column definitions from a JSON Schema.
 * Maps JSON Schema types to Trino SQL types.
 */
function jsonSchemaToColumns(
  jsonSchema: JsonSchema
): { name: string; type: string }[] {
  const { properties } = jsonSchema
  if (!properties) {
    return []
  }

  const columns: { name: string; type: string }[] = []

  for (const [name, fieldSchema] of Object.entries(properties)) {
    const fieldType = resolveFieldType(fieldSchema)
    columns.push({ name, type: fieldType })
  }

  return columns
}

/**
 * Resolves a JSON Schema field to a Trino SQL type string.
 */
function resolveFieldType(schema: JsonSchema): string {
  const type = Array.isArray(schema.type)
    ? (schema.type.find((t) => t !== "null") ?? "string")
    : (schema.type ?? "string")

  switch (type) {
    case "string": {
      if (schema.format === "date-time") {
        return "TIMESTAMP(3)"
      }
      return "VARCHAR"
    }
    case "integer": {
      return "BIGINT"
    }
    case "number": {
      return "DOUBLE"
    }
    case "boolean": {
      return "BOOLEAN"
    }
    case "object": {
      if (!schema.properties) {
        return "VARCHAR"
      }
      const fields = Object.entries(schema.properties)
        .map(
          ([name, fieldSchema]) => `${name} ${resolveFieldType(fieldSchema)}`
        )
        .join(", ")
      return `ROW(${fields})`
    }
    case "array": {
      if (!schema.items) {
        return "ARRAY(VARCHAR)"
      }
      const itemType = resolveFieldType(schema.items)
      return `ARRAY(${itemType})`
    }
    default: {
      return "VARCHAR"
    }
  }
}

/**
 * Executes the write pipeline:
 * 1. Convert records to Parquet via @lakeql/parquet
 * 2. Upload to S3 via storage operations
 * 3. Manage Hive table DDL via Trino client
 *
 * Behavior varies by load strategy:
 * - full_load: delete existing → upload latest.parquet → recreate table
 * - full_load_append: full_load steps + append to all.parquet/<partition_path>/ → recreate table pair
 * - append: upload to all.parquet/<partition_path>/ only → recreate single table
 *
 * Defaults to full_load when loadStrategy is not specified.
 *
 * @throws {Error} if any step fails (pipeline stops at first error)
 */
export async function executeWritePipeline(
  input: WritePipelineInput
): Promise<void> {
  const { records, jsonSchema, config } = input
  const loadStrategy: LoadStrategy = config.loadStrategy ?? "full_load"
  const { basePath, bucket, region, endpoint, table, trinoClient } = config
  const storageType = config.type ?? "s3"

  // Build StorageConfig from flat pipeline config fields
  const storageConfig: StorageConfig = {
    type: storageType,
    bucket,
    region,
    endpoint,
  }

  // Step 1: Convert records to Parquet (fail-fast: stops before S3)
  const parquetBuffer = writeParquet({ records, jsonSchema })

  // Create storage operations
  const storage = createStorageOperations(storageConfig)

  // Create Hive table manager
  const hiveManager = createHiveTableManager({
    client: trinoClient,
    bucket,
  })

  // Derive columns from JSON schema for Hive DDL
  const columns = jsonSchemaToColumns(jsonSchema)

  switch (loadStrategy) {
    case "full_load": {
      await executeFullLoad({
        storage,
        hiveManager,
        parquetBuffer,
        basePath,
        table,
        columns,
        bucket,
      })
      break
    }

    case "full_load_append": {
      await executeFullLoadAppend({
        storage,
        hiveManager,
        parquetBuffer,
        basePath,
        table,
        columns,
        bucket,
      })
      break
    }

    case "append": {
      await executeAppend({
        storage,
        hiveManager,
        parquetBuffer,
        basePath,
        table,
        columns,
        bucket,
      })
      break
    }

    default: {
      break
    }
  }
}

interface StrategyContext {
  storage: ReturnType<typeof createStorageOperations>
  hiveManager: ReturnType<typeof createHiveTableManager>
  parquetBuffer: Uint8Array
  basePath: string
  table: { catalog: string; schema: string; tableName: string }
  columns: { name: string; type: string }[]
  bucket: string
}

/**
 * full_load strategy: delete prefix → upload latest.parquet → recreate table
 */
async function executeFullLoad(ctx: StrategyContext): Promise<void> {
  const {
    storage,
    hiveManager,
    parquetBuffer,
    basePath,
    table,
    columns,
    bucket,
  } = ctx
  const latestPath = `${basePath}/latest.parquet`

  // Step 2a: Delete existing data at prefix (fail-fast: stops before upload)
  await storage.deletePrefix(basePath)

  // Step 2b: Upload new Parquet file (fail-fast: stops before DDL)
  await storage.upload(parquetBuffer, latestPath)

  // Step 3: Recreate Hive table pointing to latest.parquet
  const tableDefinition: HiveTableDefinition = {
    catalog: table.catalog,
    schema: table.schema,
    tableName: table.tableName,
    externalLocation: `s3://${bucket}/${latestPath}`,
    columns,
  }

  await hiveManager.recreateTable(tableDefinition)
}

/**
 * full_load_append strategy:
 * full_load steps + upload to all.parquet/partition_path/ → recreate table pair
 */
async function executeFullLoadAppend(ctx: StrategyContext): Promise<void> {
  const {
    storage,
    hiveManager,
    parquetBuffer,
    basePath,
    table,
    columns,
    bucket,
  } = ctx
  const latestPath = `${basePath}/latest.parquet`
  const partitionPath = generatePartitionPath()
  const allPath = `${basePath}/all.parquet/${partitionPath}`

  // Step 2a: Delete existing data at latest prefix (fail-fast)
  await storage.deletePrefix(`${basePath}/latest.parquet`)

  // Step 2b: Upload to latest.parquet (fail-fast: stops before historical upload)
  await storage.upload(parquetBuffer, latestPath)

  // Step 2c: Upload to all.parquet/partition_path/ (fail-fast: stops before DDL)
  await storage.upload(parquetBuffer, allPath)

  // Step 3: Recreate table pair (_latest and _all)
  const latestDefinition: HiveTableDefinition = {
    catalog: table.catalog,
    schema: table.schema,
    tableName: `${table.tableName}_latest`,
    externalLocation: `s3://${bucket}/${basePath}/latest.parquet`,
    columns,
  }

  const allDefinition: HiveTableDefinition = {
    catalog: table.catalog,
    schema: table.schema,
    tableName: `${table.tableName}_all`,
    externalLocation: `s3://${bucket}/${basePath}/all.parquet/`,
    columns,
  }

  await hiveManager.recreateTablePair(latestDefinition, allDefinition)
}

/**
 * append strategy: upload to all.parquet/partition_path/ → recreate single table
 */
async function executeAppend(ctx: StrategyContext): Promise<void> {
  const {
    storage,
    hiveManager,
    parquetBuffer,
    basePath,
    table,
    columns,
    bucket,
  } = ctx
  const partitionPath = generatePartitionPath()
  const allPath = `${basePath}/all.parquet/${partitionPath}`

  // Step 2: Upload to all.parquet/partition_path/ (fail-fast: stops before DDL)
  await storage.upload(parquetBuffer, allPath)

  // Step 3: Recreate Hive table pointing to all.parquet/
  const tableDefinition: HiveTableDefinition = {
    catalog: table.catalog,
    schema: table.schema,
    tableName: table.tableName,
    externalLocation: `s3://${bucket}/${basePath}/all.parquet/`,
    columns,
  }

  await hiveManager.recreateTable(tableDefinition)
}
