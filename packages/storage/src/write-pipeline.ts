// oxlint-disable no-await-in-loop
import crypto from "node:crypto"

import type { LoadStrategy } from "@lakeql/datasource"
import type { JsonSchema } from "@lakeql/parquet"
import { AUTO_FILL_WRITE_TIMESTAMP } from "@lakeql/schema-generator/endpoint-schema"
import type {
  PartitioningComponent,
  PartitioningValue,
} from "@lakeql/schema-generator/endpoint-schema"

import type { Serializer } from "./serializer/types"
import type { StorageOperations } from "./storage-operations"
import type {
  ManagedTableDefinition,
  TableManager,
  TableManagerCallOptions,
} from "./table-manager/types"

/**
 * Configuration for the write pipeline.
 *
 * Receives pre-resolved dependencies (StorageOperations, TableManager, Serializer)
 * rather than constructing them internally. The caller (e.g. TrinoWriteStrategy)
 * is responsible for building these from the DataSource storage config.
 */
export interface WritePipelineConfig {
  /**
   * The load strategy for this endpoint.
   * @default "full_load"
   */
  loadStrategy?: LoadStrategy
  /** The base path for storing serialized files. */
  basePath: string
  /** Hive table definition for DDL management. */
  table: {
    catalog: string
    schema: string
    tableName: string
  }
  /**
   * Pre-built storage operations for file upload/delete/list.
   * Constructed by the caller from a files-sdk `Files` instance.
   */
  storage: StorageOperations
  /**
   * TableManager for DDL operations.
   * Injected by the caller (e.g. TrinoWriteStrategy constructs and injects a HiveTableManager).
   */
  tableManager: TableManager
  /**
   * Serializer for converting records to binary format.
   * Injected by the caller (e.g. parquetSerializer()).
   */
  serializer: Serializer
  /**
   * Partitioning mode. `false` disables partitioning, or a string of
   * `/`-separated segments (bare field name or `field:component`). Governs only
   * the on-disk path layout.
   */
  partitioning?: PartitioningValue
  /**
   * Server-populated auto-fill fields for this write. Each entry names a
   * top-level field the pipeline stamps from the shared write clock on every
   * schema-writing load (`append`, `full_load_append`), together with its
   * derived `_year`/`_month` companion columns. Independent of
   * {@link WritePipelineConfig.partitioning}: the columns are always populated
   * when auto-fill fields are present, even when partitioning is disabled
   * (C4/C10).
   */
  autoFillFields?: { name: string; kind: "write_timestamp" }[]
  /** When true, shadow tables are retained after successful DDL. Default: false. */
  keepShadowTables?: boolean
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
 * Generates a flat file path (no partitioning).
 */
export function generateFlatPath(extension = "parquet"): string {
  return `${crypto.randomUUID()}.${extension}`
}

/**
 * Resolved partitioning mode after normalizing the raw config.
 */
export type PartitionMode = "disabled" | "custom"

/**
 * The normalized partitioning configuration used internally by the pipeline.
 */
export interface ResolvedPartitioning {
  mode: PartitionMode
  formatString?: string
}

/**
 * Normalizes the raw partitioning config into a resolved structure. Every
 * string value (bare field name or `field:component` segments) resolves to
 * `custom`.
 *
 * @param partitioning - The raw partitioning value; absent resolves to `false`.
 * @returns The resolved partitioning mode and segment string.
 */
export function resolvePartitioningConfig(
  partitioning: PartitioningValue = false
): ResolvedPartitioning {
  if (partitioning === false) {
    return { mode: "disabled" }
  }
  return { mode: "custom", formatString: partitioning }
}

/**
 * A write-timestamp auto-fill field to populate on a schema-writing load.
 */
export interface AutoFillField {
  /** The top-level field name to stamp from the shared write clock. */
  name: string
  /** The auto-fill kind; only `"write_timestamp"` is supported today. */
  kind: "write_timestamp"
}

/**
 * Enriches a JSON Schema with the columns derived from the given auto-fill
 * fields: for each field `<name>` it adds a `date-time` string column `<name>`
 * and the integer companions `<name>_year` / `<name>_month` (NFR1 — companion
 * names come from the shared {@link AUTO_FILL_WRITE_TIMESTAMP} contract).
 * Returns a new schema object (does not mutate the input).
 *
 * @param jsonSchema - The base schema to enrich.
 * @param autoFillFields - The auto-fill fields whose columns to add.
 * @returns A new schema including every auto-fill column.
 */
export function enrichJsonSchemaWithAutoFill(
  jsonSchema: JsonSchema,
  autoFillFields: AutoFillField[]
): JsonSchema {
  const properties = { ...jsonSchema.properties }
  for (const field of autoFillFields) {
    properties[field.name] = { type: "string", format: "date-time" }
    properties[`${field.name}${AUTO_FILL_WRITE_TIMESTAMP.yearSuffix}`] = {
      type: "integer",
    }
    properties[`${field.name}${AUTO_FILL_WRITE_TIMESTAMP.monthSuffix}`] = {
      type: "integer",
    }
  }
  return { ...jsonSchema, properties }
}

/**
 * Populates the auto-fill columns on every record from a single shared write
 * clock: for each field `<name>` sets `<name>` to the ISO timestamp,
 * `<name>_year` to the UTC year, and `<name>_month` to the UTC month (1–12).
 * All fields share the one `timestamp` value (C14). Returns a new record array
 * (does not mutate the input).
 *
 * @param records - The records to populate.
 * @param autoFillFields - The auto-fill fields to populate.
 * @param timestamp - The shared write clock applied to every field and record.
 * @returns A new array of populated records.
 */
export function injectAutoFillValues(
  records: Record<string, unknown>[],
  autoFillFields: AutoFillField[],
  timestamp: Date
): Record<string, unknown>[] {
  const isoValue = timestamp.toISOString()
  const year = timestamp.getUTCFullYear()
  const month = timestamp.getUTCMonth() + 1
  return records.map((record) => {
    const next = { ...record }
    for (const field of autoFillFields) {
      next[field.name] = isoValue
      next[`${field.name}${AUTO_FILL_WRITE_TIMESTAMP.yearSuffix}`] = year
      next[`${field.name}${AUTO_FILL_WRITE_TIMESTAMP.monthSuffix}`] = month
    }
    return next
  })
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
 * Appends `/<uuid>.<extension>` at the end.
 *
 * @throws {PartitionFieldError} if a referenced field is missing, null, or (for date segments) not a valid ISO date
 */
export function generateCustomPartitionPath(
  record: Record<string, unknown>,
  segments: PartitionSegment[],
  recordIndex = 0,
  extension = "parquet"
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
  return `${pathParts.join("/")}/${uuid}.${extension}`
}

/**
 * Groups records by their custom partition path.
 * Records with the same partition key go to the same file (one UUID per unique partition key).
 *
 * @throws {PartitionFieldError} if any record has a missing, null, or invalid field value
 */
export function groupRecordsByCustomPartition(
  records: Record<string, unknown>[],
  segments: PartitionSegment[],
  extension = "parquet"
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
    const path = `${key}/${uuid}.${extension}`
    result.set(path, groupRecords)
  }

  return result
}

/**
 * Derives Hive column definitions from a JSON Schema.
 * Maps JSON Schema types to SQL types (Hive/Trino).
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
 * Resolves a JSON Schema field to an SQL type string (Hive-compatible).
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
 * 1. Serialize records via the injected Serializer
 * 2. Upload to storage via pre-built StorageOperations
 * 3. Manage Hive table DDL via injected TableManager
 *
 * Behavior varies by load strategy:
 * - full_load: delete existing → upload latest.<ext> → recreate table (partitioning ignored)
 * - full_load_append: full_load steps + append to all.<ext>/<partition_path>/ → recreate table pair
 * - append: upload to all.<ext>/<partition_path>/ only → recreate single table
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
  const { basePath, table, storage, serializer } = config

  // Use injected table manager
  const hiveManager = config.tableManager

  // Per-call keepShadowTables override forwarded to the table manager.
  // The pipeline carries the caller-resolved value (DataSourceWriteConfig >
  // WritePipelineConfig); the manager falls back to its own config when unset.
  const tableManagerOptions: TableManagerCallOptions = {
    keepShadowTables: config.keepShadowTables,
  }

  // Resolve partitioning
  const partitioning = resolvePartitioningConfig(config.partitioning)

  // For full_load, partitioning is irrelevant — existing behavior unchanged
  if (loadStrategy === "full_load") {
    const output = await serializer.serialize(records, jsonSchema)
    const columns = jsonSchemaToColumns(jsonSchema)
    await executeFullLoad({
      storage,
      hiveManager,
      buffer: output.buffer,
      extension: output.extension,
      contentType: output.contentType,
      basePath,
      table,
      columns,
      tableManagerOptions,
    })
    return
  }

  // Populate auto-fill columns from a single shared write clock, gated on the
  // presence of autoFillFields and NOT on the partitioning mode (C10/C14).
  let effectiveSchema = jsonSchema
  let effectiveRecords = records
  const now = new Date()

  const autoFillFields = config.autoFillFields ?? []
  if (autoFillFields.length > 0) {
    effectiveSchema = enrichJsonSchemaWithAutoFill(jsonSchema, autoFillFields)
    effectiveRecords = injectAutoFillValues(records, autoFillFields, now)
  }

  const columns = jsonSchemaToColumns(effectiveSchema)

  switch (partitioning.mode) {
    case "disabled": {
      const output = await serializer.serialize(
        effectiveRecords,
        effectiveSchema
      )
      const flatPath = generateFlatPath(output.extension)
      const allPath = `${basePath}/all.${output.extension}/${flatPath}`

      if (loadStrategy === "full_load_append") {
        const latestDir = `${basePath}/latest.${output.extension}`
        const latestFile = `${latestDir}/${crypto.randomUUID()}.${output.extension}`

        // Step 1: List existing latest files BEFORE upload
        const oldLatestKeys = await storage.listPrefix(latestDir)

        // Step 2: Upload both files (latest + all)
        await storage.upload(output.buffer, latestFile, {
          contentType: output.contentType,
        })
        await storage.upload(output.buffer, allPath, {
          contentType: output.contentType,
        })

        // Step 3: Recreate table pair (safe DDL via shadow pattern)
        const latestDef: ManagedTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_latest`,
          externalLocation: hiveManager.buildExternalLocation(`${latestDir}/`),
          columns,
        }
        const allDef: ManagedTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_all`,
          externalLocation: hiveManager.buildExternalLocation(
            `${basePath}/all.${output.extension}/`
          ),
          columns,
        }
        await hiveManager.recreateTablePair(
          latestDef,
          allDef,
          tableManagerOptions
        )

        // Step 4: Delete old latest files ONLY after DDL succeeded
        if (oldLatestKeys.length > 0) {
          await storage.deleteKeys(oldLatestKeys)
        }
      } else {
        // append
        await storage.upload(output.buffer, allPath, {
          contentType: output.contentType,
        })

        const tableDef: ManagedTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: table.tableName,
          externalLocation: hiveManager.buildExternalLocation(
            `${basePath}/all.${output.extension}/`
          ),
          columns,
        }
        await hiveManager.recreateTable(tableDef, tableManagerOptions)
      }
      break
    }

    case "custom": {
      const segments = parsePartitioningFormat(partitioning.formatString ?? "")
      const output = await serializer.serialize(
        effectiveRecords,
        effectiveSchema
      )
      const groups = groupRecordsByCustomPartition(
        effectiveRecords,
        segments,
        output.extension
      )

      for (const [partPath, groupRecords] of groups) {
        const groupOutput = await serializer.serialize(
          groupRecords,
          effectiveSchema
        )
        const allPath = `${basePath}/all.${output.extension}/${partPath}`
        await storage.upload(groupOutput.buffer, allPath, {
          contentType: groupOutput.contentType,
        })
      }

      if (loadStrategy === "full_load_append") {
        const latestOutput = await serializer.serialize(
          effectiveRecords,
          effectiveSchema
        )
        const latestDir = `${basePath}/latest.${output.extension}`
        const latestFile = `${latestDir}/${crypto.randomUUID()}.${output.extension}`

        // Step 1: List existing latest files BEFORE upload
        const oldLatestKeys = await storage.listPrefix(latestDir)

        // Step 2: Upload latest file
        await storage.upload(latestOutput.buffer, latestFile, {
          contentType: latestOutput.contentType,
        })

        // Step 3: Recreate table pair (safe DDL via shadow pattern)
        const latestDef: ManagedTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_latest`,
          externalLocation: hiveManager.buildExternalLocation(`${latestDir}/`),
          columns,
        }
        const allDef: ManagedTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: `${table.tableName}_all`,
          externalLocation: hiveManager.buildExternalLocation(
            `${basePath}/all.${output.extension}/`
          ),
          columns,
        }
        await hiveManager.recreateTablePair(
          latestDef,
          allDef,
          tableManagerOptions
        )

        // Step 4: Delete old latest files ONLY after DDL succeeded
        if (oldLatestKeys.length > 0) {
          await storage.deleteKeys(oldLatestKeys)
        }
      } else {
        // append
        const tableDef: ManagedTableDefinition = {
          catalog: table.catalog,
          schema: table.schema,
          tableName: table.tableName,
          externalLocation: hiveManager.buildExternalLocation(
            `${basePath}/all.${output.extension}/`
          ),
          columns,
        }
        await hiveManager.recreateTable(tableDef, tableManagerOptions)
      }
      break
    }

    default: {
      const _exhaustive: never = partitioning.mode
      throw new Error(`Unhandled partitioning mode: ${String(_exhaustive)}`)
    }
  }
}

interface StrategyContext {
  storage: StorageOperations
  hiveManager: TableManager
  buffer: Uint8Array
  extension: string
  contentType?: string
  basePath: string
  table: { catalog: string; schema: string; tableName: string }
  columns: { name: string; type: string }[]
  tableManagerOptions?: TableManagerCallOptions
}

/**
 * full_load strategy: list old files → upload new → recreate table → delete old files
 *
 * Old data is only deleted AFTER the full cycle (upload + DDL) succeeds.
 * If upload or DDL fails, old files are preserved (no data loss).
 * Listing before upload captures any orphans from prior failed runs (self-healing).
 */
async function executeFullLoad(ctx: StrategyContext): Promise<void> {
  const {
    storage,
    hiveManager,
    buffer,
    extension,
    contentType,
    basePath,
    table,
    columns,
    tableManagerOptions,
  } = ctx
  const latestDir = `${basePath}/latest.${extension}`
  const latestFile = `${latestDir}/${crypto.randomUUID()}.${extension}`

  // Step 1: List existing files BEFORE upload (captures orphans from prior failed runs)
  const oldKeys = await storage.listPrefix(latestDir)

  // Step 2: Upload new file (coexists with old files briefly)
  await storage.upload(buffer, latestFile, { contentType })

  // Step 3: Recreate Hive table pointing to latest.<ext>/ directory
  const tableDefinition: ManagedTableDefinition = {
    catalog: table.catalog,
    schema: table.schema,
    tableName: table.tableName,
    externalLocation: hiveManager.buildExternalLocation(`${latestDir}/`),
    columns,
  }

  await hiveManager.recreateTable(tableDefinition, tableManagerOptions)

  // Step 4: Delete old files ONLY after DDL succeeded
  if (oldKeys.length > 0) {
    await storage.deleteKeys(oldKeys)
  }
}
