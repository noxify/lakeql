// oxlint-disable no-await-in-loop
import crypto from "node:crypto"

import { writeParquet } from "@lakeql/parquet"
import type { JsonSchema } from "@lakeql/parquet"
import type {
  PartitioningComponent,
  PartitioningFormat,
  PartitioningValue,
} from "@lakeql/schema-generator/endpoint-schema"
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
  /**
   * The load strategy for this endpoint.
   * @default "full_load"
   */
  loadStrategy?: LoadStrategy
  /**
   * Storage adapter type.
   * @default "s3"
   */
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
  /**
   * Partitioning mode. `true` partitions by write timestamp, `false` disables, or a string for field-based/custom.
   * @default true
   */
  partitioning?: PartitioningValue
  /**
   * Partition format granularity.
   * @default "year/month/day"
   */
  partitioningFormat?: PartitioningFormat
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
 * Generates a Hive-style partition path based on date and format.
 * Format options:
 * - "year":           year=YYYY/<uuid>.parquet
 * - "year/month":     year=YYYY/month=MM/<uuid>.parquet
 * - "year/month/day": year=YYYY/month=MM/day=DD/<uuid>.parquet
 */
export function generatePartitionPath(
  date: Date,
  format: PartitioningFormat = "year/month/day"
): string {
  const year = date.getUTCFullYear().toString().padStart(4, "0")
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = date.getUTCDate().toString().padStart(2, "0")
  const uuid = crypto.randomUUID()

  switch (format) {
    case "year": {
      return `year=${year}/${uuid}.parquet`
    }
    case "year/month": {
      return `year=${year}/month=${month}/${uuid}.parquet`
    }
    case "year/month/day": {
      return `year=${year}/month=${month}/day=${day}/${uuid}.parquet`
    }
    default: {
      return `year=${year}/month=${month}/day=${day}/${uuid}.parquet`
    }
  }
}

/**
 * Generates a flat file path (no partitioning).
 */
export function generateFlatPath(): string {
  return `${crypto.randomUUID()}.parquet`
}

/**
 * Resolved partitioning mode after normalizing the raw config.
 */
export type PartitionMode = "disabled" | "timestamp" | "field" | "custom"

/**
 * The normalized partitioning configuration used internally by the pipeline.
 */
export interface ResolvedPartitioning {
  mode: PartitionMode
  format: PartitioningFormat
  fieldName?: string
  formatString?: string
}

/**
 * Normalizes the raw partitioning config into a resolved structure.
 */
export function resolvePartitioningConfig(
  partitioning: PartitioningValue = true,
  partitioningFormat: PartitioningFormat = "year/month/day"
): ResolvedPartitioning {
  if (partitioning === false) {
    return { mode: "disabled", format: partitioningFormat }
  }
  if (partitioning === true) {
    return { mode: "timestamp", format: partitioningFormat }
  }
  // String value: check if it's a custom format (contains / or :)
  if (partitioning.includes("/") || partitioning.includes(":")) {
    return {
      mode: "custom",
      format: partitioningFormat,
      formatString: partitioning,
    }
  }
  return { mode: "field", format: partitioningFormat, fieldName: partitioning }
}

/**
 * Adds load_timestamp to JSON Schema for consistent Parquet + Hive DDL derivation.
 * Returns a new schema object (does not mutate the input).
 */
export function enrichJsonSchemaWithTimestamp(
  jsonSchema: JsonSchema
): JsonSchema {
  return {
    ...jsonSchema,
    properties: {
      ...jsonSchema.properties,
      load_timestamp: {
        type: "string",
        format: "date-time",
      },
    },
  }
}

/**
 * Injects load_timestamp value into each record.
 * Returns new record array (does not mutate input).
 */
export function injectLoadTimestamp(
  records: Record<string, unknown>[],
  timestamp: Date
): Record<string, unknown>[] {
  const isoValue = timestamp.toISOString()
  return records.map((record) => ({
    ...record,
    load_timestamp: isoValue,
  }))
}

/**
 * Error thrown when a record's partition field is missing, null, or invalid.
 */
export class PartitionFieldError extends Error {
  readonly fieldName: string
  readonly reason: "missing" | "null" | "invalid_date"
  readonly recordIndex: number
  readonly value?: unknown

  constructor(
    fieldName: string,
    reason: "missing" | "null" | "invalid_date",
    recordIndex: number,
    value?: unknown
  ) {
    super(
      reason === "missing"
        ? `Partition field "${fieldName}" not found in record at index ${recordIndex}`
        : reason === "null"
          ? `Partition field "${fieldName}" is null/empty in record at index ${recordIndex}`
          : `Partition field "${fieldName}" has invalid date value "${value}" in record at index ${recordIndex}`
    )
    this.name = "PartitionFieldError"
    this.fieldName = fieldName
    this.reason = reason
    this.recordIndex = recordIndex
    this.value = value
  }
}

/**
 * Parses ISO 8601 date (YYYY-MM-DD) or datetime (YYYY-MM-DDTHH:mm:ssZ) strings.
 * Returns null for invalid or non-ISO-formatted dates.
 */
export function parseISODate(value: string): Date | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  // Validate it's a proper ISO format (not just any parseable string)
  const isoDatePattern =
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/u
  if (!isoDatePattern.test(value)) {
    return null
  }
  return date
}

/**
 * Validates and groups records by their partition field value.
 * Returns a Map from partition path to the records belonging to that partition.
 *
 * @throws {PartitionFieldError} if any record has a missing, null, or unparseable field value
 */
export function groupRecordsByPartition(
  records: Record<string, unknown>[],
  fieldName: string,
  format: PartitioningFormat
): Map<string, Record<string, unknown>[]> {
  const groups = new Map<string, Record<string, unknown>[]>()

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i] as Record<string, unknown>

    if (!(fieldName in record)) {
      throw new PartitionFieldError(fieldName, "missing", i)
    }

    const value = record[fieldName]
    if (value === null || value === undefined || value === "") {
      throw new PartitionFieldError(fieldName, "null", i)
    }

    const date = parseISODate(String(value))
    if (!date) {
      throw new PartitionFieldError(fieldName, "invalid_date", i, value)
    }

    const partitionPath = generatePartitionPath(date, format)
    const group = groups.get(partitionPath) ?? []
    group.push(record)
    groups.set(partitionPath, group)
  }

  return groups
}

/**
 * A parsed segment from a custom partition format string.
 */
export interface PartitionSegment {
  /** The field name to extract from the record. */
  fieldName: string
  /** If set, extract this date component from the field's ISO date value. */
  component?: PartitioningComponent
}

/**
 * Parses a custom partition format string into an array of segments.
 *
 * Format: "segment/segment/..." where each segment is either:
 * - A plain field name: "customer_id" → extracts raw value
 * - A field with date component: "event_date:year" → extracts year from ISO date
 */
export function parsePartitioningFormat(format: string): PartitionSegment[] {
  const parts = format.split("/")
  const segments: PartitionSegment[] = []

  for (const part of parts) {
    if (part.includes(":")) {
      const [fieldName, component] = part.split(":") as [string, string]
      segments.push({
        fieldName,
        component: component as PartitioningComponent,
      })
    } else {
      segments.push({ fieldName: part })
    }
  }

  return segments
}

/**
 * Extracts a date component value from a Date object, zero-padded.
 */
function extractDateComponent(
  date: Date,
  component: PartitioningComponent
): string {
  switch (component) {
    case "year": {
      return date.getUTCFullYear().toString().padStart(4, "0")
    }
    case "month": {
      return (date.getUTCMonth() + 1).toString().padStart(2, "0")
    }
    case "day": {
      return date.getUTCDate().toString().padStart(2, "0")
    }
    case "hour": {
      return date.getUTCHours().toString().padStart(2, "0")
    }
    case "minute": {
      return date.getUTCMinutes().toString().padStart(2, "0")
    }
    case "second": {
      return date.getUTCSeconds().toString().padStart(2, "0")
    }
    default: {
      const _exhaustive: never = component
      throw new Error(`Unknown date component: ${_exhaustive}`)
    }
  }
}
/**
 * Generates a custom partition path from a record and parsed segments.
 * For each segment:
 * - Without component: formats as `fieldName=<value>`
 * - With component: parses the field as ISO date, extracts the component, formats as `component=<value>`
 * Appends `/<uuid>.parquet` at the end.
 *
 * @throws {PartitionFieldError} if a referenced field is missing, null, or (for date segments) not a valid ISO date
 */
export function generateCustomPartitionPath(
  record: Record<string, unknown>,
  segments: PartitionSegment[],
  recordIndex = 0
): string {
  const pathParts: string[] = []

  for (const segment of segments) {
    if (!(segment.fieldName in record)) {
      throw new PartitionFieldError(segment.fieldName, "missing", recordIndex)
    }

    const value = record[segment.fieldName]
    if (value === null || value === undefined || value === "") {
      throw new PartitionFieldError(segment.fieldName, "null", recordIndex)
    }

    if (segment.component) {
      // Date component extraction
      const date = parseISODate(String(value))
      if (!date) {
        throw new PartitionFieldError(
          segment.fieldName,
          "invalid_date",
          recordIndex,
          value
        )
      }
      const componentValue = extractDateComponent(date, segment.component)
      pathParts.push(`${segment.component}=${componentValue}`)
    } else {
      // Raw value extraction
      pathParts.push(`${segment.fieldName}=${String(value)}`)
    }
  }

  const uuid = crypto.randomUUID()
  return `${pathParts.join("/")}/${uuid}.parquet`
}

/**
 * Groups records by their custom partition path.
 * Records with the same partition key go to the same file (one UUID per unique partition key).
 *
 * @throws {PartitionFieldError} if any record has a missing, null, or invalid field value
 */
export function groupRecordsByCustomPartition(
  records: Record<string, unknown>[],
  segments: PartitionSegment[]
): Map<string, Record<string, unknown>[]> {
  // First pass: compute the partition key for each record (without UUID)
  const keyToRecords = new Map<string, Record<string, unknown>[]>()

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i] as Record<string, unknown>
    const keyParts: string[] = []

    for (const segment of segments) {
      if (!(segment.fieldName in record)) {
        throw new PartitionFieldError(segment.fieldName, "missing", i)
      }

      const value = record[segment.fieldName]
      if (value === null || value === undefined || value === "") {
        throw new PartitionFieldError(segment.fieldName, "null", i)
      }

      if (segment.component) {
        const date = parseISODate(String(value))
        if (!date) {
          throw new PartitionFieldError(
            segment.fieldName,
            "invalid_date",
            i,
            value
          )
        }
        const componentValue = extractDateComponent(date, segment.component)
        keyParts.push(`${segment.component}=${componentValue}`)
      } else {
        keyParts.push(`${segment.fieldName}=${String(value)}`)
      }
    }

    const key = keyParts.join("/")
    const group = keyToRecords.get(key) ?? []
    group.push(record)
    keyToRecords.set(key, group)
  }

  // Second pass: assign a UUID to each unique partition key
  const result = new Map<string, Record<string, unknown>[]>()
  for (const [key, groupRecords] of keyToRecords) {
    const uuid = crypto.randomUUID()
    const path = `${key}/${uuid}.parquet`
    result.set(path, groupRecords)
  }

  return result
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
 * - full_load: delete existing → upload latest.parquet → recreate table (partitioning ignored)
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

  // Resolve partitioning
  const partitioning = resolvePartitioningConfig(
    config.partitioning,
    config.partitioningFormat
  )

  // Build StorageConfig from flat pipeline config fields
  const storageConfig: StorageConfig = {
    type: storageType,
    bucket,
    region,
    endpoint,
  }

  // For full_load, partitioning is irrelevant — existing behavior unchanged
  if (loadStrategy === "full_load") {
    const parquetBuffer = writeParquet({ records, jsonSchema })
    const storage = createStorageOperations(storageConfig)
    const hiveManager = createHiveTableManager({ client: trinoClient, bucket })
    const columns = jsonSchemaToColumns(jsonSchema)
    await executeFullLoad({
      storage,
      hiveManager,
      parquetBuffer,
      basePath,
      table,
      columns,
      bucket,
    })
    return
  }

  // Enrich schema and records based on partitioning mode
  let effectiveSchema = jsonSchema
  let effectiveRecords = records
  const now = new Date()

  if (partitioning.mode === "timestamp") {
    effectiveSchema = enrichJsonSchemaWithTimestamp(jsonSchema)
    effectiveRecords = injectLoadTimestamp(records, now)
  }

  const storage = createStorageOperations(storageConfig)
  const hiveManager = createHiveTableManager({ client: trinoClient, bucket })
  const columns = jsonSchemaToColumns(effectiveSchema)

  switch (partitioning.mode) {
    case "disabled": {
      const parquetBuffer = writeParquet({
        records: effectiveRecords,
        jsonSchema: effectiveSchema,
      })
      const flatPath = generateFlatPath()
      const allPath = `${basePath}/all.parquet/${flatPath}`

      if (loadStrategy === "full_load_append") {
        const latestPath = `${basePath}/latest.parquet`
        await storage.deletePrefix(`${basePath}/latest.parquet`)
        await storage.upload(parquetBuffer, latestPath)
        await storage.upload(parquetBuffer, allPath)

        const latestDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_latest`,
          externalLocation: `s3://${bucket}/${basePath}/latest.parquet`,
          columns,
        }
        const allDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_all`,
          externalLocation: `s3://${bucket}/${basePath}/all.parquet/`,
          columns,
        }
        await hiveManager.recreateTablePair(latestDef, allDef)
      } else {
        // append
        await storage.upload(parquetBuffer, allPath)

        const tableDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: table.tableName,
          externalLocation: `s3://${bucket}/${basePath}/all.parquet/`,
          columns,
        }
        await hiveManager.recreateTable(tableDef)
      }
      break
    }

    case "timestamp": {
      const parquetBuffer = writeParquet({
        records: effectiveRecords,
        jsonSchema: effectiveSchema,
      })
      const partitionPath = generatePartitionPath(now, partitioning.format)
      const allPath = `${basePath}/all.parquet/${partitionPath}`

      if (loadStrategy === "full_load_append") {
        const latestPath = `${basePath}/latest.parquet`
        await storage.deletePrefix(`${basePath}/latest.parquet`)
        await storage.upload(parquetBuffer, latestPath)
        await storage.upload(parquetBuffer, allPath)

        const latestDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_latest`,
          externalLocation: `s3://${bucket}/${basePath}/latest.parquet`,
          columns,
        }
        const allDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_all`,
          externalLocation: `s3://${bucket}/${basePath}/all.parquet/`,
          columns,
        }
        await hiveManager.recreateTablePair(latestDef, allDef)
      } else {
        // append
        await storage.upload(parquetBuffer, allPath)

        const tableDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: table.tableName,
          externalLocation: `s3://${bucket}/${basePath}/all.parquet/`,
          columns,
        }
        await hiveManager.recreateTable(tableDef)
      }
      break
    }

    case "field": {
      const groups = groupRecordsByPartition(
        records,
        partitioning.fieldName ?? "",
        partitioning.format
      )
      for (const [partPath, groupRecords] of groups) {
        const parquetBuffer = writeParquet({
          records: groupRecords,
          jsonSchema: effectiveSchema,
        })
        const allPath = `${basePath}/all.parquet/${partPath}`
        await storage.upload(parquetBuffer, allPath)
      }

      if (loadStrategy === "full_load_append") {
        const latestParquet = writeParquet({
          records,
          jsonSchema: effectiveSchema,
        })
        const latestPath = `${basePath}/latest.parquet`
        await storage.deletePrefix(`${basePath}/latest.parquet`)
        await storage.upload(latestParquet, latestPath)

        const latestDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_latest`,
          externalLocation: `s3://${bucket}/${basePath}/latest.parquet`,
          columns,
        }
        const allDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_all`,
          externalLocation: `s3://${bucket}/${basePath}/all.parquet/`,
          columns,
        }
        await hiveManager.recreateTablePair(latestDef, allDef)
      } else {
        // append
        const tableDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: table.tableName,
          externalLocation: `s3://${bucket}/${basePath}/all.parquet/`,
          columns,
        }
        await hiveManager.recreateTable(tableDef)
      }
      break
    }

    case "custom": {
      const segments = parsePartitioningFormat(partitioning.formatString ?? "")
      const groups = groupRecordsByCustomPartition(records, segments)

      for (const [partPath, groupRecords] of groups) {
        const parquetBuffer = writeParquet({
          records: groupRecords,
          jsonSchema: effectiveSchema,
        })
        const allPath = `${basePath}/all.parquet/${partPath}`
        await storage.upload(parquetBuffer, allPath)
      }

      if (loadStrategy === "full_load_append") {
        const latestParquet = writeParquet({
          records,
          jsonSchema: effectiveSchema,
        })
        const latestPath = `${basePath}/latest.parquet`
        await storage.deletePrefix(`${basePath}/latest.parquet`)
        await storage.upload(latestParquet, latestPath)

        const latestDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_latest`,
          externalLocation: `s3://${bucket}/${basePath}/latest.parquet`,
          columns,
        }
        const allDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_all`,
          externalLocation: `s3://${bucket}/${basePath}/all.parquet/`,
          columns,
        }
        await hiveManager.recreateTablePair(latestDef, allDef)
      } else {
        // append
        const tableDef: HiveTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: table.tableName,
          externalLocation: `s3://${bucket}/${basePath}/all.parquet/`,
          columns,
        }
        await hiveManager.recreateTable(tableDef)
      }
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
