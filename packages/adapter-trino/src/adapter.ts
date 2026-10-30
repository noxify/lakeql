/* eslint-disable max-classes-per-file */

/**
 * Trino adapter core: row zipper, tagged error, and
 * `TrinoDataSource` implementation.
 *
 * @module
 */

import type {
  AdapterFactory,
  ColumnInfo,
  DataSource,
  DataSourceCapabilities,
  QueryProps,
  ReadStrategyPaging,
  ResolveAuth,
  SourceConfig,
  TableDefinition,
} from "@lakeql/datasource"
import {
  QueryExecutionError,
  UnsupportedOperationError,
} from "@lakeql/datasource"
import { createSqlReadStrategy } from "@lakeql/sql-read-strategy"
import { TrinoClient } from "@lakeql/trino-client"
import type { Column } from "@lakeql/trino-client"

import { validateTrinoConfig, validateTrinoWriteConfig } from "./config"
import type { TrinoInsertWriteConfig } from "./config"
import { ADAPTER_NAME } from "./constants"
import { trinoDialect } from "./dialect"
import { classifyTrinoError } from "./errors"
import { createTrinoInsertWriteStrategy } from "./insert-write-strategy"
import { trinoResponseNormalizer } from "./normalizer"
import {
  escapeLiteral,
  parseTrinoColumnType,
  quoteIdentifier,
  quoteQualifiedIdentifier,
} from "./sql-helpers"
import { trinoTypeMapper } from "./type-mapper"
import { createTrinoWriteStrategy } from "./write-strategy"
import type { TrinoWriteStrategyConfig } from "./write-strategy"

/**
 * Unique symbol that marks errors originating from the row zipper.
 * The stream wrapper inspects this tag to route errors correctly:
 * tagged errors become `QueryExecutionError` directly, while all
 * other iteration failures go through `classifyTrinoError()`.
 */
const ROW_ZIPPER_TAG: unique symbol = Symbol("RowZipperError")

/**
 * Adapter-private tagged error thrown inside the TrinoClient
 * `transform` callback when the row zipper detects an invariant
 * violation (missing columns, count mismatch, or duplicate names).
 *
 * The stream wrapper checks the {@link ROW_ZIPPER_TAG} property to
 * classify this error as a `QueryExecutionError` without passing it
 * through `classifyTrinoError()`.
 */
class RowZipperError extends Error {
  readonly [ROW_ZIPPER_TAG] = true

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "RowZipperError"
  }
}

/**
 * Returns `true` when the error was produced by the row zipper's
 * transform wrapper. This is the sole detection mechanism used by the
 * stream wrapper to route errors.
 *
 * @param error - The value caught during iteration.
 * @returns Whether the error carries the row-zipper tag.
 */
function isRowZipperError(error: unknown): error is RowZipperError {
  return (
    typeof error === "object" &&
    error !== null &&
    ROW_ZIPPER_TAG in error &&
    (error as Record<symbol, unknown>)[ROW_ZIPPER_TAG] === true
  )
}

/**
 * Build a keyed record from a positional Trino row and its column
 * metadata.
 *
 * The zipper is deterministic and fail-closed:
 * - Rejects a non-empty row when column metadata is empty or absent.
 * - Rejects rows whose value count does not match the column count.
 * - Rejects duplicate column names under exact case-sensitive
 *   comparison.
 * - Preserves `null`, `0`, `false`, and empty-string values without
 *   truthiness checks.
 *
 * @param row     - Positional values from the TrinoClient.
 * @param columns - Column metadata supplied by the TrinoClient for
 *                  this row (the client falls back to initial columns
 *                  when a subsequent page omits metadata).
 * @returns A keyed record mapping each column name to its value.
 * @throws {Error} On invariant violations described above.
 */
function zipRow(row: unknown[], columns: Column[]): Record<string, unknown> {
  if (row.length > 0 && columns.length === 0) {
    throw new Error(
      "Row zipper: received a non-empty row but column metadata is empty or absent"
    )
  }

  if (row.length !== columns.length) {
    throw new Error(
      `Row zipper: value count (${row.length}) does not match column count (${columns.length})`
    )
  }

  const seen = new Set<string>()
  for (const col of columns) {
    if (seen.has(col.name)) {
      throw new Error(`Row zipper: duplicate column name "${col.name}"`)
    }
    seen.add(col.name)
  }

  const record: Record<string, unknown> = {}
  for (let i = 0; i < columns.length; i += 1) {
    // Safety: bounds are guarded by the length-match check above.
    const col = columns[i] as Column
    record[col.name] = row[i]
  }

  return record
}

/**
 * Create the TrinoClient `transform` callback that converts positional
 * rows into keyed records.
 *
 * Errors thrown by {@link zipRow} are caught and re-thrown as
 * {@link RowZipperError} instances so the stream wrapper can identify
 * them by tag without relying on class identity heuristics.
 *
 * @returns A transform function suitable for `TrinoClient.query()` and
 *          `TrinoClient.stream()`.
 */
function createRowTransform(): (
  row: unknown[],
  columns: Column[]
) => Record<string, unknown> {
  return (row, columns) => {
    try {
      return zipRow(row, columns)
    } catch (error) {
      throw new RowZipperError(
        error instanceof Error ? error.message : "Row zipper failed",
        { cause: error }
      )
    }
  }
}

/** @internal */
export { createRowTransform }
/** @internal */
export { isRowZipperError }
/** @internal */
export { zipRow }
/** @internal */
export { ROW_ZIPPER_TAG }

/**
 * Shared stateless row transform instance. Avoids creating a new closure
 * on every query/stream/metadata call since the transform is stateless.
 */
const ROW_TRANSFORM = createRowTransform()

/**
 * Capabilities declared by every `TrinoDataSource` instance.
 *
 * Supports query, stream, all metadata discovery, DDL, and write
 * (full_load, full_load_append, append via the storage write pipeline).
 */
const TRINO_CAPABILITIES: DataSourceCapabilities = {
  query: true,
  stream: true,
  metadata: {
    catalogs: true,
    schemas: true,
    tables: true,
    views: true,
    columns: true,
  },
  write: {
    supported: true,
    modes: ["full_load", "full_load_append", "append"],
  },
  ddl: {
    createTable: true,
    dropTable: true,
  },
}

/** @internal */
export { TRINO_CAPABILITIES }

/**
 * Trino implementation of the adapter-neutral {@link DataSource}
 * contract.
 *
 * Constructed exclusively through `trinoAdapterFactory.createDataSource()`.
 * The class holds a single {@link TrinoClient} and the runtime
 * data-source name for error context.
 */
class TrinoDataSource implements DataSource {
  readonly adapter = ADAPTER_NAME
  readonly capabilities = TRINO_CAPABILITIES
  readonly typeMapper = trinoTypeMapper

  /** @internal */
  private readonly client: TrinoClient
  /** @internal */
  private readonly dataSourceName: string

  /** Tracks whether {@link close} has been called. */
  private closed = false

  constructor(client: TrinoClient, dataSourceName: string) {
    this.client = client
    this.dataSourceName = dataSourceName
  }

  /**
   * Execute a client operation with unified error classification.
   * Row-zipper errors become `QueryExecutionError` with the original
   * cause; all other errors go through `classifyTrinoError()`.
   */
  private async executeWithErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (isRowZipperError(error)) {
        throw new QueryExecutionError(
          error.message,
          ADAPTER_NAME,
          this.dataSourceName,
          { cause: error.cause }
        )
      }
      throw classifyTrinoError(error, this.dataSourceName)
    }
  }

  /** Throw if the data source has been closed. */
  private assertNotClosed(): void {
    if (this.closed) {
      throw new QueryExecutionError(
        "DataSource is closed",
        ADAPTER_NAME,
        this.dataSourceName
      )
    }
  }

  /**
   * Executes a SQL query and returns all rows as keyed records.
   *
   * Rejects `requestAuth` before evaluating options or invoking the
   * client. Forwards `sql`, `signal`, and `options.impersonateAs` to
   * `TrinoClient.query()` with the adapter-owned row zipper.
   */
  async query<TRow>(props: QueryProps): Promise<TRow[]> {
    this.assertNotClosed()

    if (props.requestAuth !== undefined) {
      throw new UnsupportedOperationError(
        "Trino request-scoped authentication is not supported in this adapter slice",
        ADAPTER_NAME,
        this.dataSourceName,
        "requestAuth"
      )
    }

    const impersonateAs = extractImpersonateAs(props.options)

    return this.executeWithErrorHandling(async () =>
      this.client.query<TRow>({
        sql: props.sql,
        signal: props.signal,
        impersonateAs,
        transform: ROW_TRANSFORM as (row: unknown[], columns: Column[]) => TRow,
      })
    )
  }

  /**
   * Executes a SQL query and returns rows as an asynchronous generator.
   *
   * Returns a wrapping async generator that catches errors from each
   * iteration of the underlying client generator and classifies them:
   * row-zipper tagged errors become `QueryExecutionError` directly;
   * all other errors go through `classifyTrinoError()`.
   */
  async stream<TRow>(props: QueryProps): Promise<AsyncGenerator<TRow>> {
    this.assertNotClosed()

    if (props.requestAuth !== undefined) {
      throw new UnsupportedOperationError(
        "Trino request-scoped authentication is not supported in this adapter slice",
        ADAPTER_NAME,
        this.dataSourceName,
        "requestAuth"
      )
    }

    const impersonateAs = extractImpersonateAs(props.options)

    // The initial stream() call may throw — classify immediately.
    const clientGenerator = await this.executeWithErrorHandling(async () =>
      this.client.stream<TRow>({
        sql: props.sql,
        signal: props.signal,
        impersonateAs,
        transform: ROW_TRANSFORM as (row: unknown[], columns: Column[]) => TRow,
      })
    )

    const { dataSourceName } = this
    return wrapStreamGenerator<TRow>(clientGenerator, dataSourceName)
  }

  /**
   * Lists all catalogs visible to the current connection.
   *
   * Executes `SHOW CATALOGS` and flattens the first column of each
   * row into a string array.
   */
  async catalogs(): Promise<string[]> {
    this.assertNotClosed()

    return this.executeWithErrorHandling(async () => {
      const rows = await this.client.query<Record<string, unknown>>({
        sql: "SHOW CATALOGS",
        transform: ROW_TRANSFORM,
      })
      return rows.map((row) => String(row["Catalog"]))
    })
  }

  /**
   * Lists schemas within the given catalog.
   *
   * Executes `SHOW SCHEMAS FROM <quoted-catalog>` and flattens the
   * first column of each row into a string array.
   *
   * @param catalog - The catalog whose schemas to list.
   */
  async schemas(catalog: string): Promise<string[]> {
    this.assertNotClosed()

    const sql = `SHOW SCHEMAS FROM ${quoteIdentifier(catalog)}`
    return this.executeWithErrorHandling(async () => {
      const rows = await this.client.query<Record<string, unknown>>({
        sql,
        transform: ROW_TRANSFORM,
      })
      return rows.map((row) => String(row["Schema"]))
    })
  }

  /**
   * Lists base tables within the given catalog and schema.
   *
   * Queries `information_schema.tables` with a quoted catalog
   * identifier, an escaped schema literal, and the `BASE TABLE`
   * predicate.
   *
   * @param catalog - The catalog to query.
   * @param schema  - The schema to filter on.
   */
  async tables(catalog: string, schema: string): Promise<string[]> {
    this.assertNotClosed()

    const sql = `SELECT table_name FROM ${quoteIdentifier(catalog)}.information_schema.tables WHERE table_schema = ${escapeLiteral(schema)} AND table_type = 'BASE TABLE'`
    return this.executeWithErrorHandling(async () => {
      const rows = await this.client.query<Record<string, unknown>>({
        sql,
        transform: ROW_TRANSFORM,
      })
      return rows.map((row) => String(row["table_name"]))
    })
  }

  /**
   * Lists views within the given catalog and schema.
   *
   * Queries `information_schema.tables` with a quoted catalog
   * identifier, an escaped schema literal, and the `VIEW` predicate.
   *
   * @param catalog - The catalog to query.
   * @param schema  - The schema to filter on.
   */
  async views(catalog: string, schema: string): Promise<string[]> {
    this.assertNotClosed()

    const sql = `SELECT table_name FROM ${quoteIdentifier(catalog)}.information_schema.tables WHERE table_schema = ${escapeLiteral(schema)} AND table_type = 'VIEW'`
    return this.executeWithErrorHandling(async () => {
      const rows = await this.client.query<Record<string, unknown>>({
        sql,
        transform: ROW_TRANSFORM,
      })
      return rows.map((row) => String(row["table_name"]))
    })
  }

  /**
   * Lists columns for the given fully-qualified table.
   *
   * Executes `SHOW COLUMNS FROM <catalog>.<schema>.<table>` and maps
   * positional result columns to `ColumnInfo` objects. The Trino
   * `comment` column is mapped to `ColumnInfo.description`.
   *
   * @param catalog - The catalog containing the table.
   * @param schema  - The schema containing the table.
   * @param table   - The table whose columns to list.
   */
  async columns(
    catalog: string,
    schema: string,
    table: string
  ): Promise<ColumnInfo[]> {
    this.assertNotClosed()

    const sql = `SHOW COLUMNS FROM ${quoteQualifiedIdentifier(catalog, schema, table)}`
    return this.executeWithErrorHandling(async () => {
      const rows = await this.client.query<Record<string, unknown>>({
        sql,
        transform: ROW_TRANSFORM,
      })
      return rows.map((row): ColumnInfo => ({
        name: String(row["Column"]),
        type: String(row["Type"]),
        extra:
          row["Extra"] === null || row["Extra"] === undefined
            ? undefined
            : String(row["Extra"]),
        description:
          row["Comment"] !== null && row["Comment"] !== undefined
            ? String(row["Comment"])
            : undefined,
      }))
    })
  }

  /**
   * Creates a table in Trino with validated identifiers and column types.
   *
   * Renders `CREATE TABLE` (without `IF NOT EXISTS` or `WITH`) using
   * quoted identifiers and canonicalized types from the scalar type
   * whitelist. Validates all inputs before invoking the client.
   *
   * @throws {Error} If the definition has zero columns, duplicate column
   *   names, invalid identifiers, or unsupported column types.
   * @throws {DataSourceError} If the client query fails.
   */
  async createTable(definition: TableDefinition): Promise<void> {
    this.assertNotClosed()

    if (definition.columns.length === 0) {
      throw new Error("CREATE TABLE requires at least one column")
    }

    const seenNames = new Set<string>()
    for (const col of definition.columns) {
      if (seenNames.has(col.name)) {
        throw new Error(`CREATE TABLE: duplicate column name "${col.name}"`)
      }
      seenNames.add(col.name)
    }

    // quoteIdentifier() rejects empty/control-char names.
    // parseTrinoColumnType() rejects unsupported types.
    // Throws immediately on the first failure.
    const columnDefs: string[] = []
    for (const col of definition.columns) {
      const quotedName = quoteIdentifier(col.name)
      const canonicalType = parseTrinoColumnType(col.type)
      columnDefs.push(`${quotedName} ${canonicalType}`)
    }

    const qualifiedTable = quoteQualifiedIdentifier(
      definition.catalog,
      definition.schema,
      definition.table
    )
    const sql = `CREATE TABLE ${qualifiedTable} (${columnDefs.join(", ")})`

    await this.executeWithErrorHandling(async () => {
      await this.client.query({ sql })
    })
  }

  /**
   * Drops a table in Trino if it exists.
   *
   * Renders `DROP TABLE IF EXISTS` with each identifier segment quoted.
   *
   * @throws {DataSourceError} If the client query fails.
   */
  async dropTable(
    catalog: string,
    schema: string,
    table: string
  ): Promise<void> {
    this.assertNotClosed()

    const qualifiedTable = quoteQualifiedIdentifier(catalog, schema, table)
    const sql = `DROP TABLE IF EXISTS ${qualifiedTable}`

    await this.executeWithErrorHandling(async () => {
      await this.client.query({ sql })
    })
  }

  /**
   * Returns a safely quoted Trino qualified table name.
   *
   * Applies {@link quoteIdentifier} independently to each of the three
   * segments (`catalog`, `schema`, `tableName`) and joins them with dots.
   * Empty or control-character-containing segments are rejected by
   * `quoteIdentifier()`.
   *
   * @param config - Source configuration with catalog, schema, and tableName.
   * @returns The quoted qualified identifier, e.g. `"catalog"."schema"."table"`.
   * @throws {Error} If any segment is empty or contains control characters.
   */
  // oxlint-disable-next-line class-methods-use-this -- contract method; stateless delegation
  qualifiedTableName(config: SourceConfig): string {
    return quoteQualifiedIdentifier(
      config.catalog,
      config.schema,
      config.tableName
    )
  }

  /**
   * Cancel all tracked queries and mark the data source as closed.
   *
   * The first call delegates to {@link TrinoClient.cancelAllQueries}
   * for every query ID currently tracked and resolves without error,
   * even if individual cancellation requests fail. Subsequent calls
   * resolve immediately without invoking `cancelAllQueries()` again.
   *
   * Best-effort semantics: in-flight queries whose ID has not yet been
   * registered or stream generators whose query ID is untracked are
   * outside the scope of `cancelAllQueries()` and are not cancelled.
   * Async generators previously returned by `stream()` may continue
   * yielding rows until their next client interaction observes
   * cancellation.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    try {
      await this.client.cancelAllQueries()
    } catch {
      // Best-effort: resolve even if cancellations fail.
    }
  }
}

/** @internal */
export { TrinoDataSource }

/**
 * Extract `impersonateAs` from adapter-specific query options.
 *
 * @returns The value when it is a non-empty string, or `undefined`.
 */
function extractImpersonateAs(
  options: Record<string, unknown> | undefined
): string | undefined {
  if (options === undefined || options === null) {
    return undefined
  }
  const value = options.impersonateAs
  if (typeof value === "string" && value.length > 0) {
    return value
  }
  return undefined
}

/**
 * Wrap a client async generator to classify errors from each
 * iteration. Row-zipper tagged errors become `QueryExecutionError`
 * directly; all other errors are passed through `classifyTrinoError()`.
 *
 * @yields {TRow} Keyed row records from the underlying client generator.
 */
async function* wrapStreamGenerator<TRow>(
  clientGenerator: AsyncGenerator<TRow>,
  dataSourceName: string
): AsyncGenerator<TRow> {
  try {
    while (true) {
      let result: IteratorResult<TRow>
      try {
        // eslint-disable-next-line no-await-in-loop
        result = await clientGenerator.next()
      } catch (error) {
        if (isRowZipperError(error)) {
          throw new QueryExecutionError(
            error.message,
            ADAPTER_NAME,
            dataSourceName,
            { cause: error.cause }
          )
        }
        throw classifyTrinoError(error, dataSourceName)
      }

      if (result.done) {
        return result.value
      }

      yield result.value
    }
  } finally {
    // Ensure the client generator is closed on error or consumer abort,
    // so any internal finally blocks in the client generator can run.
    await clientGenerator.return(undefined as unknown as TRow)
  }
}

/**
 * Trino adapter factory implementing the neutral {@link AdapterFactory}
 * contract.
 *
 * The factory is stateless: it retains no mutable per-data-source state
 * between calls to `createDataSource()`, `createReadStrategy()`, and
 * `createWriteStrategy()`. All construction methods are synchronous and
 * do not perform network requests, metadata discovery, hidden global
 * registration, or environment lookup.
 */
export const trinoAdapterFactory: AdapterFactory = {
  adapterName: ADAPTER_NAME,

  createDataSource(config: unknown, name: string): DataSource {
    validateTrinoConfig(config)

    // Construct exactly one TrinoClient, forwarding fields from the
    // validated config. Optional fields are only included when defined,
    // so the client does not receive explicit `undefined` values that
    // would override its internal defaults.
    const clientProps: {
      host: string
      port: number
      catalog: string
      auth:
        | { type: "basic"; username: string; password: string }
        | { type: "bearer"; token: string }
      schema?: string
      source?: string
      retry?: Record<string, unknown>
      timeout?: number
    } = {
      host: config.host,
      port: config.port,
      catalog: config.catalog,
      auth: config.auth,
    }

    if (config.schema !== undefined) {
      clientProps.schema = config.schema
    }
    if (config.source !== undefined) {
      clientProps.source = config.source
    }
    if (config.retry !== undefined) {
      clientProps.retry = config.retry as Record<string, unknown>
    }
    if (config.timeout !== undefined) {
      clientProps.timeout = config.timeout
    }

    const client = new TrinoClient(clientProps)
    return new TrinoDataSource(client, name)
  },

  createReadStrategy({
    dataSource,
    resolveAuth,
    paging,
  }: {
    dataSource: DataSource
    resolveAuth: ResolveAuth
    paging?: ReadStrategyPaging
  }) {
    return createSqlReadStrategy({
      dataSource,
      resolveAuth,
      dialect: trinoDialect,
      normalizer: trinoResponseNormalizer,
      readValidation: paging
        ? { maxPerPage: paging.maxRecordsPerPage }
        : undefined,
      defaultPerPage: paging?.defaultPerPage,
    })
  },

  createWriteStrategy({
    dataSource,
    dataSourceName,
    writeConfig,
  }: {
    dataSource: DataSource
    dataSourceName: string
    writeConfig: unknown
  }) {
    const raw = writeConfig ?? {}
    validateTrinoWriteConfig(raw)

    if ((raw as { strategy?: string }).strategy === "insert") {
      const insertConfig = raw as TrinoInsertWriteConfig
      return createTrinoInsertWriteStrategy({
        dataSource,
        dataSourceName,
        config: {
          batchSize: insertConfig.batchSize,
          autoCreateTable: insertConfig.autoCreateTable,
          tableProperties: insertConfig.tableProperties,
        },
      })
    }

    return createTrinoWriteStrategy({
      ...(raw as Omit<TrinoWriteStrategyConfig, "dataSource">),
      dataSource,
    })
  },
}

/**
 * Typed-config registration value compatible with
 * `AdapterDefinition<"trino", TrinoConnectionConfig, unknown, TrinoWriteConfig>`
 * from `@lakeql/config` through structural typing.
 *
 * The adapter package does NOT import or depend on `@lakeql/config`. This
 * definition is consumed by `defineConfig()` to provide compile-time
 * connection-shape inference and per-adapter `writeConfig` narrowing
 * (`TrinoWriteConfig`) for Trino data sources.
 *
 * Intentionally omits `registrationOptions` and `mergeDataSourceConfig`
 * because Trino receives a complete explicit connection payload.
 */
export const trinoAdapterDefinition = {
  /** Literal adapter name for typed narrowing. */
  adapterName: ADAPTER_NAME,
  /** The exact adapter factory instance. */
  factory: trinoAdapterFactory,
  /** The shared assertion-style config validator. */
  validateDataSourceConfig: validateTrinoConfig,
  /**
   * Pins the adapter's `writeConfig` type to {@link TrinoWriteConfig} at the
   * `defineConfig()` call site. Carries the compile-time type only; runtime
   * validation happens in {@link trinoAdapterFactory.createWriteStrategy}.
   */
  validateWriteConfig: validateTrinoWriteConfig,
} as const
