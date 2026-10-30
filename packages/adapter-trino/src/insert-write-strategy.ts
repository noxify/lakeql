/**
 * Trino `INSERT INTO` write strategy.
 *
 * Writes records via batched `INSERT ... VALUES` statements executed through
 * the data source, with no object-storage or Parquet dependency. Supports the
 * three neutral load strategies (`append`, `full_load`, `full_load_append`).
 *
 * This module intentionally imports only neutral `@lakeql/datasource` types and
 * the adapter's own SQL helpers / value renderer — never `@lakeql/storage` or
 * `files-sdk`.
 *
 * @module
 */

import type {
  DataSource,
  DataSourceWriteInput,
  DataSourceWriteStrategy,
  LoadStrategy,
} from "@lakeql/datasource"

import {
  quoteIdentifier,
  quoteQualifiedIdentifier,
  sanitizeColumnType,
} from "./sql-helpers"
import { renderValuesClause } from "./value-render"

/** A JSON-schema-derived column with its Trino column type. */
interface ColumnDef {
  name: string
  type: string
}

/** Default number of rows per `INSERT ... VALUES` batch. */
export const DEFAULT_BATCH_SIZE = 1000

/**
 * Resolved configuration for {@link createTrinoInsertWriteStrategy}.
 */
export interface TrinoInsertWriteStrategyConfig {
  /** Data source used to execute INSERT/DDL statements. */
  dataSource: DataSource
  /** Configured runtime name of the data source (for error context). */
  dataSourceName: string
  /** Adapter-owned INSERT write options. */
  config: {
    batchSize?: number
    autoCreateTable?: boolean
    tableProperties?: Record<string, string>
  }
}

interface Target {
  catalog: string
  schema: string
  tableName: string
}

/**
 * Minimal JSON-schema view: top-level property names define the column order
 * and their types map to Trino column types.
 */
interface SchemaLike {
  properties?: Record<string, { type?: string | string[]; format?: string }>
}

/**
 * Maps a JSON-schema property to a Trino column type. Union types like
 * `["string", "null"]` resolve to their first non-null member.
 */
function schemaTypeToTrino(prop: {
  type?: string | string[]
  format?: string
}): string {
  const raw = Array.isArray(prop.type)
    ? (prop.type.find((t) => t !== "null") ?? "string")
    : (prop.type ?? "string")

  switch (raw) {
    case "integer": {
      return "BIGINT"
    }
    case "number": {
      return "DOUBLE"
    }
    case "boolean": {
      return "BOOLEAN"
    }
    case "string": {
      return prop.format === "date-time" ? "TIMESTAMP(3)" : "VARCHAR"
    }
    default: {
      return "VARCHAR"
    }
  }
}

/**
 * Creates a Trino {@link DataSourceWriteStrategy} that writes via `INSERT INTO`.
 *
 * Capability requirements are checked eagerly: `autoCreateTable` and the
 * `full_load`/`full_load_append` swap require the data source to report DDL
 * support.
 *
 * @param args - Data source, its name, and INSERT options.
 * @returns A write strategy backed by batched INSERT statements.
 */
export function createTrinoInsertWriteStrategy(
  args: TrinoInsertWriteStrategyConfig
): DataSourceWriteStrategy {
  const { dataSource, dataSourceName, config } = args
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE

  return {
    async write(input: DataSourceWriteInput): Promise<void> {
      const loadStrategy: LoadStrategy = input.config.loadStrategy ?? "append"
      const target = input.config.table

      // Empty input: nothing to write, regardless of load strategy.
      if (input.records.length === 0) {
        return
      }

      const columns = columnDefsFromSchema(input.schema)
      if (columns.length === 0) {
        throw new Error(
          `Trino insert write for "${dataSourceName}" requires a schema with at least one property`
        )
      }
      const columnNames = columns.map((c) => c.name)

      assertCapabilities(dataSource, loadStrategy, config, dataSourceName)

      switch (loadStrategy) {
        case "append": {
          if (config.autoCreateTable) {
            await createIfNotExists(dataSource, target, columns)
          }
          await insertAll(
            dataSource,
            target,
            input.records,
            columnNames,
            batchSize
          )
          break
        }
        case "full_load": {
          await fullLoadSwap(
            dataSource,
            target,
            input.records,
            columns,
            batchSize,
            dataSourceName
          )
          break
        }
        case "full_load_append": {
          const latest: Target = {
            ...target,
            tableName: `${target.tableName}_latest`,
          }
          const all: Target = {
            ...target,
            tableName: `${target.tableName}_all`,
          }
          // Replace latest first; only extend all after latest succeeds.
          await fullLoadSwap(
            dataSource,
            latest,
            input.records,
            columns,
            batchSize,
            dataSourceName
          )
          if (config.autoCreateTable) {
            await createIfNotExists(dataSource, all, columns)
          }
          await insertAll(
            dataSource,
            all,
            input.records,
            columnNames,
            batchSize
          )
          break
        }
        default: {
          throw new Error(
            `Unsupported load strategy for Trino insert write: ${String(loadStrategy)}`
          )
        }
      }
    },
  }
}

/**
 * Derives ordered typed column definitions from the write input schema's
 * top-level properties.
 */
function columnDefsFromSchema(schema: unknown): ColumnDef[] {
  const properties = (schema as SchemaLike | undefined)?.properties
  if (!properties) {
    return []
  }
  return Object.entries(properties).map(([name, prop]) => ({
    name,
    type: schemaTypeToTrino(prop),
  }))
}

/**
 * Verifies the data source reports the DDL capabilities required by the
 * requested load strategy / options.
 */
function assertCapabilities(
  dataSource: DataSource,
  loadStrategy: LoadStrategy,
  config: { autoCreateTable?: boolean },
  dataSourceName: string
): void {
  const needsCreate =
    config.autoCreateTable === true ||
    loadStrategy === "full_load" ||
    loadStrategy === "full_load_append"
  const needsDrop =
    loadStrategy === "full_load" || loadStrategy === "full_load_append"

  if (needsCreate && !dataSource.capabilities.ddl.createTable) {
    throw new Error(
      `Trino insert write for "${dataSourceName}" requires CREATE TABLE support, which this data source does not report`
    )
  }
  if (needsDrop && !dataSource.capabilities.ddl.dropTable) {
    throw new Error(
      `Trino insert write for "${dataSourceName}" requires DROP TABLE support, which this data source does not report`
    )
  }
}

/** Fully-qualified quoted identifier for a target table. */
function qualified(target: Target): string {
  return quoteQualifiedIdentifier(
    target.catalog,
    target.schema,
    target.tableName
  )
}

/** Comma-separated quoted column list, e.g. `"a", "b"`. */
function quotedColumns(columnNames: readonly string[]): string {
  return columnNames.map(quoteIdentifier).join(", ")
}

/**
 * Creates the target table with typed columns if it does not already exist.
 *
 * Column types are derived from the write input JSON schema. Uses
 * `CREATE TABLE IF NOT EXISTS` so an existing table is left untouched.
 */
async function createIfNotExists(
  dataSource: DataSource,
  target: Target,
  columns: readonly ColumnDef[]
): Promise<void> {
  const columnList = columns
    .map((c) => `${quoteIdentifier(c.name)} ${sanitizeColumnType(c.type)}`)
    .join(", ")
  const sql = `CREATE TABLE IF NOT EXISTS ${qualified(target)} (${columnList})`
  await dataSource.query({ sql })
}

/** Inserts all records into the target in batches. */
async function insertAll(
  dataSource: DataSource,
  target: Target,
  records: readonly Record<string, unknown>[],
  columnNames: readonly string[],
  batchSize: number
): Promise<void> {
  const fqn = qualified(target)
  const cols = quotedColumns(columnNames)

  for (let start = 0; start < records.length; start += batchSize) {
    const batch = records.slice(start, start + batchSize)
    const values = renderValuesClause(batch, columnNames)
    const sql = `INSERT INTO ${fqn} (${cols}) VALUES ${values}`
    // eslint-disable-next-line no-await-in-loop
    await dataSource.query({ sql })
  }
}

/**
 * `full_load` via a pending-table swap: insert into a unique pending table,
 * drop the original, then rename the pending table into place. On failure
 * after data is written, the pending table is retained and its fully-qualified
 * name is reported.
 */
async function fullLoadSwap(
  dataSource: DataSource,
  target: Target,
  records: readonly Record<string, unknown>[],
  columns: readonly ColumnDef[],
  batchSize: number,
  dataSourceName: string
): Promise<void> {
  const columnNames = columns.map((c) => c.name)
  const pendingName = `${target.tableName}__pending_${Date.now()}`
  const pending: Target = { ...target, tableName: pendingName }
  const pendingFqn = qualified(pending)

  // Create the pending table with typed columns derived from the schema, so
  // full_load does not require the original table to already exist.
  try {
    await createTable(dataSource, pending, columns)
  } catch (error) {
    throw new Error(
      `Trino full_load for "${dataSourceName}": failed to create pending table ${pendingFqn}: ${messageOf(error)}`,
      { cause: error }
    )
  }

  try {
    await insertAll(dataSource, pending, records, columnNames, batchSize)
  } catch (error) {
    await dropQuietly(dataSource, pending)
    throw new Error(
      `Trino full_load for "${dataSourceName}": insert into pending table failed; pending table dropped, original unchanged: ${messageOf(error)}`,
      { cause: error }
    )
  }

  // Swap: drop the original if present, then rename pending into place.
  await dropQuietly(dataSource, target)

  try {
    await dataSource.query({
      sql: `ALTER TABLE ${pendingFqn} RENAME TO ${qualified(target)}`,
    })
  } catch (error) {
    throw new Error(
      `Trino full_load for "${dataSourceName}": original table dropped but rename of pending table failed. ` +
        `Recover from pending table ${pendingFqn}: ${messageOf(error)}`,
      { cause: error }
    )
  }
}

/**
 * Renders a typed `CREATE TABLE` (without `IF NOT EXISTS`) for the pending
 * table used in the full-load swap.
 */
async function createTable(
  dataSource: DataSource,
  target: Target,
  columns: readonly ColumnDef[]
): Promise<void> {
  const columnList = columns
    .map((c) => `${quoteIdentifier(c.name)} ${sanitizeColumnType(c.type)}`)
    .join(", ")
  await dataSource.query({
    sql: `CREATE TABLE ${qualified(target)} (${columnList})`,
  })
}

/** Best-effort drop that never throws (used for recovery cleanup). */
async function dropQuietly(
  dataSource: DataSource,
  target: Target
): Promise<void> {
  try {
    await dataSource.dropTable(target.catalog, target.schema, target.tableName)
  } catch {
    // Cleanup is best-effort; the caller reports the primary failure.
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
