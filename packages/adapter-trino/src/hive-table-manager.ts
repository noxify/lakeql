import type { DataSource } from "@lakeql/datasource"
import type {
  ManagedTableDefinition,
  TableManager,
  TableManagerCallOptions,
} from "@lakeql/storage"
import type { Files } from "files-sdk"

import {
  escapeLiteral,
  quoteIdentifier,
  quoteQualifiedIdentifier,
  sanitizeColumnType,
} from "./sql-helpers"

/**
 * URI scheme mapping for known file storage providers (keyed by lowercased
 * adapter name). S3-compatible providers use `s3a://`; unknown providers fall
 * back to `s3a://` as well.
 */
const HIVE_URI_SCHEME: Record<string, string> = {
  s3: "s3a://",
  minio: "s3a://",
  r2: "s3a://",
  wasabi: "s3a://",
  gcs: "gs://",
  azure: "abfss://",
}

/** Fallback URI scheme for S3-compatible or unknown providers. */
const DEFAULT_URI_SCHEME = "s3a://"

/**
 * Tracks whether the one-time auto-derivation warning has already been emitted
 * for this process, so it is not repeated on every table operation.
 */
let autoDerivationWarned = false

/**
 * Resets the one-time auto-derivation warning flag. Exposed for tests to
 * assert the warning fires exactly once.
 *
 * @internal
 */
export function resetAutoDerivationWarning(): void {
  autoDerivationWarned = false
}

/**
 * Configuration for the Hive Table Manager.
 */
export interface HiveTableManagerConfig {
  /** The DataSource instance to use for DDL operations. */
  dataSource: DataSource
  /** The files-sdk instance for deriving external location URIs. */
  files: Files
  /**
   * Override for Hive external_location prefix.
   * Auto-derived from `files.adapter.name` + `files.adapter.bucket` for known providers.
   * Recommended to set explicitly for production/Azure/custom Hadoop connectors.
   * When provided, used verbatim as the prefix for `buildExternalLocation`.
   */
  externalLocationPrefix?: string
  /** When true, shadow tables are not dropped after successful recreation. Default: false. */
  keepShadowTables?: boolean
}

/**
 * Builds the external location prefix from a files-sdk adapter instance.
 * Derives the URI scheme from `adapter.name` and the bucket from `adapter.bucket`.
 *
 * @throws {Error} When `adapter.bucket` is unavailable and no `externalLocationPrefix` is provided.
 */
function buildDefaultPrefix(files: Files): string {
  const adapterName = files.adapter.name
  const { bucket } = files.adapter as { bucket?: string }

  if (!bucket) {
    throw new Error(
      `HiveTableManager: cannot resolve bucket from files-sdk adapter "${adapterName}". ` +
        `Provide an explicit "externalLocationPrefix" in your storage config.`
    )
  }

  const scheme =
    HIVE_URI_SCHEME[adapterName.toLowerCase()] ?? DEFAULT_URI_SCHEME
  const prefix = `${scheme}${bucket}`

  if (!autoDerivationWarned) {
    autoDerivationWarned = true
    // eslint-disable-next-line no-console
    console.warn(
      `HiveTableManager: auto-derived external location prefix "${prefix}" ` +
        `from files-sdk adapter "${adapterName}". Set "externalLocationPrefix" ` +
        `explicitly for production or custom Hadoop connectors.`
    )
  }

  return prefix
}

/**
 * Renders a `CREATE TABLE` DDL statement with properly quoted identifiers.
 *
 * @param definition - The table definition to render.
 * @param ifNotExists - When true, includes `IF NOT EXISTS` in the DDL.
 */
function renderCreateTableDdl(
  definition: ManagedTableDefinition,
  ifNotExists: boolean
): string {
  const qualifiedName = quoteQualifiedIdentifier(
    definition.catalog,
    definition.schema,
    definition.tableName
  )
  const columnDefs = definition.columns
    .map((c) => `${quoteIdentifier(c.name)} ${sanitizeColumnType(c.type)}`)
    .join(",\n  ")
  const ifNotExistsClause = ifNotExists ? " IF NOT EXISTS" : ""

  return (
    `CREATE TABLE${ifNotExistsClause} ${qualifiedName} (\n  ${columnDefs}\n)\n` +
    `WITH (\n  external_location = ${escapeLiteral(definition.externalLocation)},\n  format = 'PARQUET'\n)`
  )
}

/**
 * Creates a HiveTableManager that executes DDL via a DataSource instance.
 * Implements the full {@link TableManager} interface with Hive-specific DDL
 * (external tables with PARQUET format and storage locations).
 *
 * URI scheme is automatically resolved from the files-sdk adapter:
 * - S3-compatible providers (s3, minio, r2, wasabi, etc.) → `s3a://`
 * - GCS → `gs://`
 * - Azure → `abfss://`
 * - Unknown providers → `s3a://` (default)
 *
 * The bucket is derived from `files.adapter.bucket`. If the adapter does not
 * expose a bucket property, `externalLocationPrefix` must be provided.
 *
 * Table recreation uses a shadow-table pattern for safe DDL replacement:
 * 1. Drop pre-existing shadow table (if not retaining)
 * 2. Create a shadow table to validate DDL
 * 3. Drop the original table
 * 4. Create the real table with the validated DDL
 * 5. Clean up the shadow table (unless `keepShadowTables` is true)
 *
 * @example
 * ```ts
 * import { Files } from "files-sdk"
 * import { s3 } from "files-sdk/s3"
 *
 * const manager = createHiveTableManager({
 *   dataSource: trinoDataSource,
 *   files: new Files({ adapter: s3({ bucket: "my-datalake", region: "eu-central-1" }) }),
 * })
 *
 * const location = manager.buildExternalLocation("warehouse/analytics/user_events/latest.parquet/")
 * // => "s3a://my-datalake/warehouse/analytics/user_events/latest.parquet/"
 * ```
 */
export function createHiveTableManager(
  config: HiveTableManagerConfig
): TableManager {
  const { dataSource } = config

  // Resolve the external location prefix eagerly so we fail fast if bucket is missing.
  const prefix =
    config.externalLocationPrefix ?? buildDefaultPrefix(config.files)

  async function createTable(
    definition: ManagedTableDefinition
  ): Promise<void> {
    const sql = renderCreateTableDdl(definition, true)
    await dataSource.query({ sql })
  }

  async function createTableStrict(
    definition: ManagedTableDefinition
  ): Promise<void> {
    const sql = renderCreateTableDdl(definition, false)
    await dataSource.query({ sql })
  }

  async function dropTable(
    catalog: string,
    schema: string,
    table: string
  ): Promise<void> {
    await dataSource.dropTable(catalog, schema, table)
  }

  async function dropTableSafe(
    catalog: string,
    schema: string,
    table: string
  ): Promise<void> {
    try {
      await dataSource.dropTable(catalog, schema, table)
    } catch {
      // Best-effort cleanup — do not propagate
    }
  }

  async function safeRecreateTable(
    definition: ManagedTableDefinition,
    keepShadowTables: boolean
  ): Promise<void> {
    const shadowName = keepShadowTables
      ? `${definition.tableName}__shadow_${new Date()
          .toISOString()
          .replaceAll(/[-:]/gu, "")
          .replace(/\.\d+Z$/u, "Z")}`
      : `${definition.tableName}__shadow`

    const shadowDef: ManagedTableDefinition = {
      ...definition,
      tableName: shadowName,
    }

    // Step 0: Drop pre-existing shadow (only when keepShadowTables is false)
    if (!keepShadowTables) {
      try {
        await dropTable(definition.catalog, definition.schema, shadowName)
      } catch (error) {
        throw new Error(
          `Safe recreate aborted: cannot drop pre-existing shadow table "${definition.catalog}.${definition.schema}.${shadowName}": ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        )
      }
    }

    // Step 1: Validate DDL by creating a shadow table
    try {
      await createTableStrict(shadowDef)
    } catch (error) {
      throw new Error(
        `Safe recreate failed: DDL validation error for "${definition.catalog}.${definition.schema}.${definition.tableName}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }

    // Step 2: Shadow exists — drop the original table
    try {
      await dropTable(
        definition.catalog,
        definition.schema,
        definition.tableName
      )
    } catch (error) {
      // Drop of original failed — clean up shadow, propagate error
      await dropTableSafe(definition.catalog, definition.schema, shadowName)
      throw new Error(
        `Safe recreate failed: could not drop original table "${definition.catalog}.${definition.schema}.${definition.tableName}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }

    // Step 3: Create the real table with the new definition
    try {
      await createTableStrict(definition)
    } catch (error) {
      // Critical failure — original is gone, shadow still exists as recovery artifact
      const originalMessage =
        error instanceof Error ? error.message : String(error)
      throw new Error(
        `Safe recreate partially failed: original table "${definition.catalog}.${definition.schema}.${definition.tableName}" was already dropped but new creation failed. ` +
          `Shadow table "${shadowName}" still exists pointing to the same data and can be used for recovery. ` +
          `Error: ${originalMessage}`,
        { cause: error }
      )
    }

    // Step 4: Clean up shadow table (only when keepShadowTables is false)
    if (!keepShadowTables) {
      await dropTableSafe(definition.catalog, definition.schema, shadowName)
    }
  }

  /**
   * Resolves the effective keepShadowTables value for a call:
   * per-call option overrides the manager's configured default.
   */
  function resolveKeep(options?: TableManagerCallOptions): boolean {
    return options?.keepShadowTables ?? config.keepShadowTables ?? false
  }

  async function recreateTable(
    definition: ManagedTableDefinition,
    options?: TableManagerCallOptions
  ): Promise<void> {
    await safeRecreateTable(definition, resolveKeep(options))
  }

  async function recreateTablePair(
    latestDefinition: ManagedTableDefinition,
    allDefinition: ManagedTableDefinition,
    options?: TableManagerCallOptions
  ): Promise<void> {
    const keepShadowTables = resolveKeep(options)

    const latestShadowName = keepShadowTables
      ? `${latestDefinition.tableName}__shadow_${new Date()
          .toISOString()
          .replaceAll(/[-:]/gu, "")
          .replace(/\.\d+Z$/u, "Z")}`
      : `${latestDefinition.tableName}__shadow`

    const allShadowName = keepShadowTables
      ? `${allDefinition.tableName}__shadow_${new Date()
          .toISOString()
          .replaceAll(/[-:]/gu, "")
          .replace(/\.\d+Z$/u, "Z")}`
      : `${allDefinition.tableName}__shadow`

    const latestShadowDef: ManagedTableDefinition = {
      ...latestDefinition,
      tableName: latestShadowName,
    }
    const allShadowDef: ManagedTableDefinition = {
      ...allDefinition,
      tableName: allShadowName,
    }

    // Phase 0: Drop pre-existing shadows (only when keepShadowTables is false)
    if (!keepShadowTables) {
      try {
        await dropTable(
          latestDefinition.catalog,
          latestDefinition.schema,
          latestShadowName
        )
      } catch (error) {
        throw new Error(
          `Safe recreate pair aborted: cannot drop pre-existing shadow table "${latestDefinition.catalog}.${latestDefinition.schema}.${latestShadowName}": ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        )
      }

      try {
        await dropTable(
          allDefinition.catalog,
          allDefinition.schema,
          allShadowName
        )
      } catch (error) {
        throw new Error(
          `Safe recreate pair aborted: cannot drop pre-existing shadow table "${allDefinition.catalog}.${allDefinition.schema}.${allShadowName}": ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        )
      }
    }

    // Phase 1: Validate both DDLs by creating shadows
    try {
      await createTableStrict(latestShadowDef)
    } catch (error) {
      throw new Error(
        `Safe recreate pair failed: DDL validation error for latest table "${latestDefinition.catalog}.${latestDefinition.schema}.${latestDefinition.tableName}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }

    try {
      await createTableStrict(allShadowDef)
    } catch (error) {
      // Clean up latest shadow
      await dropTableSafe(
        latestDefinition.catalog,
        latestDefinition.schema,
        latestShadowName
      )
      throw new Error(
        `Safe recreate pair failed: DDL validation error for all table "${allDefinition.catalog}.${allDefinition.schema}.${allDefinition.tableName}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }

    // Phase 2: Both shadows exist — safe to drop originals
    await dropTableSafe(
      latestDefinition.catalog,
      latestDefinition.schema,
      latestDefinition.tableName
    )
    await dropTableSafe(
      allDefinition.catalog,
      allDefinition.schema,
      allDefinition.tableName
    )

    // Phase 3: Create real tables (we already know the DDL works from shadows)
    try {
      await createTableStrict(latestDefinition)
      await createTableStrict(allDefinition)
    } catch (error) {
      // Partial creation failure — shadow tables still exist as recovery artifacts
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Safe recreate pair partially failed: original tables were already dropped but final creation failed. ` +
          `Shadow tables "${latestDefinition.catalog}.${latestDefinition.schema}.${latestShadowName}" and "${allDefinition.catalog}.${allDefinition.schema}.${allShadowName}" still exist pointing to the same data and can be used for recovery. ` +
          `Error: ${msg}`,
        { cause: error }
      )
    }

    // Phase 4: Clean up shadows (only when keepShadowTables is false)
    if (!keepShadowTables) {
      await dropTableSafe(
        latestDefinition.catalog,
        latestDefinition.schema,
        latestShadowName
      )
      await dropTableSafe(
        allDefinition.catalog,
        allDefinition.schema,
        allShadowName
      )
    }
  }

  function buildExternalLocation(path: string): string {
    return `${prefix}/${path}`
  }

  return {
    createTable,
    dropTable,
    recreateTable,
    recreateTablePair,
    buildExternalLocation,
  }
}
