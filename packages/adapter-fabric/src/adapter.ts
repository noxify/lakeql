/**
 * Fabric adapter core: `FabricDataSource` implementation,
 * `fabricAdapterFactory`, and `fabricAdapterDefinition`.
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
  UnsupportedWriteStrategy,
} from "@lakeql/datasource"
import { FabricClient } from "@lakeql/fabric-client"
import { createSqlReadStrategy } from "@lakeql/sql-read-strategy"

import { validateFabricConfig } from "./config"
import { ADAPTER_NAME } from "./constants"
import { fabricDialect } from "./dialect"
import { classifyFabricError } from "./errors"
import { fabricResponseNormalizer } from "./normalizer"
import {
  escapeLiteral,
  quoteIdentifier,
  quoteQualifiedIdentifier,
} from "./sql-helpers"
import { fabricTypeMapper } from "./type-mapper"

/**
 * Capabilities declared by every `FabricDataSource` instance.
 *
 * The first adapter slice supports query, stream (simulated), and all
 * metadata discovery. DDL and write are explicitly unsupported.
 */
const FABRIC_CAPABILITIES: DataSourceCapabilities = {
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
    supported: false,
    modes: [],
  },
  ddl: {
    createTable: false,
    dropTable: false,
  },
}

/** @internal */
export { FABRIC_CAPABILITIES }

/**
 * Schemas that Fabric exposes for internal bookkeeping rather than user data.
 *
 * These are filtered out of {@link FabricDataSource.schemas} so that catalog
 * discovery only surfaces user-facing schemas. Role schemas matching the
 * `db[_]%` pattern (for example `db_owner`, `db_datareader`) are excluded
 * separately via a `LIKE` predicate.
 */
const SYSTEM_SCHEMAS = [
  "sys",
  "INFORMATION_SCHEMA",
  "guest",
  "queryinsights",
  "_rsc",
] as const

/**
 * Fabric implementation of the adapter-neutral {@link DataSource}
 * contract.
 *
 * Constructed exclusively through `fabricAdapterFactory.createDataSource()`.
 * The class holds a single {@link FabricClient} and the runtime
 * data-source name for error context.
 */
class FabricDataSource implements DataSource {
  readonly adapter = ADAPTER_NAME
  readonly capabilities = FABRIC_CAPABILITIES
  readonly typeMapper = fabricTypeMapper

  /** @internal */
  private readonly client: FabricClient
  /** @internal */
  private readonly dataSourceName: string

  /** Tracks whether {@link close} has been called. */
  private closed = false

  constructor(client: FabricClient, dataSourceName: string) {
    this.client = client
    this.dataSourceName = dataSourceName
  }

  /**
   * Execute a client operation with unified error classification.
   * All errors are passed through `classifyFabricError()`.
   */
  private async executeWithErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      throw classifyFabricError(error, this.dataSourceName)
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
   * Extracts a bearer token from query options for OBO flow.
   *
   * @returns The bearer token string, or `undefined` if not provided.
   */
  private static extractBearerToken(props: QueryProps): string | undefined {
    if (props.requestAuth === undefined) {
      return undefined
    }
    if (props.requestAuth.type === "bearer") {
      return props.requestAuth.token
    }
    if (props.requestAuth.type === "oauth2") {
      return props.requestAuth.accessToken
    }
    return undefined
  }

  /**
   * Executes a SQL query and returns all rows as keyed records.
   *
   * Fabric's TDS driver returns rows as keyed objects natively,
   * so no row-zipper transform is needed.
   */
  async query<TRow>(props: QueryProps): Promise<TRow[]> {
    this.assertNotClosed()

    const bearerToken = FabricDataSource.extractBearerToken(props)

    return this.executeWithErrorHandling(async () =>
      this.client.query<TRow>({
        sql: props.sql,
        signal: props.signal,
        bearerToken,
      })
    )
  }

  /**
   * Executes a SQL query and returns rows as an asynchronous generator.
   *
   * Fabric does not support native streaming — this simulates it by
   * running a full query and yielding rows one at a time.
   */
  async stream<TRow>(props: QueryProps): Promise<AsyncGenerator<TRow>> {
    this.assertNotClosed()

    const rows = await this.query<TRow>(props)

    async function* yieldRows(): AsyncGenerator<TRow> {
      for (const row of rows) {
        yield row
      }
    }

    return yieldRows()
  }

  /**
   * Lists all catalogs (databases) visible to the current connection.
   *
   * Queries `sys.databases` and filters out system databases.
   */
  async catalogs(): Promise<string[]> {
    this.assertNotClosed()

    return this.executeWithErrorHandling(async () => {
      const rows = await this.client.query<Record<string, unknown>>({
        sql: "SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb') ORDER BY name",
      })
      return rows.map((row) => String(row["name"]))
    })
  }

  /**
   * Lists schemas within the given catalog.
   *
   * Queries `INFORMATION_SCHEMA.SCHEMATA` with a bracket-quoted catalog
   * identifier.
   *
   * @param catalog - The catalog whose schemas to list.
   */
  async schemas(catalog: string): Promise<string[]> {
    this.assertNotClosed()

    const excluded = SYSTEM_SCHEMAS.map((name) => escapeLiteral(name)).join(
      ", "
    )
    const sql = `SELECT schema_name FROM ${quoteIdentifier(catalog)}.INFORMATION_SCHEMA.SCHEMATA WHERE schema_name NOT IN (${excluded}) AND schema_name NOT LIKE 'db[_]%' ORDER BY schema_name`
    return this.executeWithErrorHandling(async () => {
      const rows = await this.client.query<Record<string, unknown>>({ sql })
      return rows.map((row) => String(row["schema_name"]))
    })
  }

  /**
   * Lists base tables within the given catalog and schema.
   *
   * Queries `INFORMATION_SCHEMA.TABLES` with a bracket-quoted catalog
   * identifier and an escaped schema literal.
   *
   * @param catalog - The catalog to query.
   * @param schema  - The schema to filter on.
   */
  async tables(catalog: string, schema: string): Promise<string[]> {
    this.assertNotClosed()

    const sql = `SELECT table_name FROM ${quoteIdentifier(catalog)}.INFORMATION_SCHEMA.TABLES WHERE table_schema = ${escapeLiteral(schema)} AND table_type = 'BASE TABLE' ORDER BY table_name`
    return this.executeWithErrorHandling(async () => {
      const rows = await this.client.query<Record<string, unknown>>({ sql })
      return rows.map((row) => String(row["table_name"]))
    })
  }

  /**
   * Lists views within the given catalog and schema.
   *
   * Queries `INFORMATION_SCHEMA.TABLES` with a bracket-quoted catalog
   * identifier, an escaped schema literal, and the `VIEW` predicate.
   *
   * @param catalog - The catalog to query.
   * @param schema  - The schema to filter on.
   */
  async views(catalog: string, schema: string): Promise<string[]> {
    this.assertNotClosed()

    const sql = `SELECT table_name FROM ${quoteIdentifier(catalog)}.INFORMATION_SCHEMA.TABLES WHERE table_schema = ${escapeLiteral(schema)} AND table_type = 'VIEW' ORDER BY table_name`
    return this.executeWithErrorHandling(async () => {
      const rows = await this.client.query<Record<string, unknown>>({ sql })
      return rows.map((row) => String(row["table_name"]))
    })
  }

  /**
   * Lists columns for the given fully-qualified table.
   *
   * Queries `INFORMATION_SCHEMA.COLUMNS` with bracket-quoted catalog
   * and escaped schema/table literals.
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

    const sql = `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM ${quoteIdentifier(catalog)}.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ${escapeLiteral(schema)} AND TABLE_NAME = ${escapeLiteral(table)} ORDER BY ORDINAL_POSITION`
    return this.executeWithErrorHandling(async () => {
      const rows = await this.client.query<Record<string, unknown>>({ sql })
      return rows.map((row): ColumnInfo => ({
        name: String(row["COLUMN_NAME"]),
        type: String(row["DATA_TYPE"]),
        extra: row["IS_NULLABLE"] === "YES" ? "nullable" : undefined,
        description: undefined,
      }))
    })
  }

  /**
   * Not supported by Fabric adapter. Always throws
   * {@link UnsupportedOperationError}.
   */
  async createTable(_definition: TableDefinition): Promise<void> {
    this.assertNotClosed()

    throw new UnsupportedOperationError(
      "Fabric adapter does not support CREATE TABLE in this adapter slice",
      ADAPTER_NAME,
      this.dataSourceName,
      "createTable"
    )
  }

  /**
   * Not supported by Fabric adapter. Always throws
   * {@link UnsupportedOperationError}.
   */
  async dropTable(
    _catalog: string,
    _schema: string,
    _table: string
  ): Promise<void> {
    this.assertNotClosed()

    throw new UnsupportedOperationError(
      "Fabric adapter does not support DROP TABLE in this adapter slice",
      ADAPTER_NAME,
      this.dataSourceName,
      "dropTable"
    )
  }

  /**
   * Returns a safely bracket-quoted Fabric qualified table name.
   *
   * Applies {@link quoteIdentifier} independently to each of the three
   * segments (`catalog`, `schema`, `tableName`) and joins them with dots.
   *
   * @param config - Source configuration with catalog, schema, and tableName.
   * @returns The bracket-quoted qualified identifier, e.g. `[catalog].[schema].[table]`.
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
   * Closes the underlying Fabric client connection.
   *
   * Subsequent calls resolve immediately without invoking `close()` again.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    try {
      await this.client.close()
    } catch {
      // Best-effort: resolve even if close fails.
    }
  }
}

/** @internal */
export { FabricDataSource }

/**
 * Fabric adapter factory implementing the neutral {@link AdapterFactory}
 * contract.
 *
 * The factory is stateless: it retains no mutable per-data-source state
 * between calls to `createDataSource()`, `createReadStrategy()`, and
 * `createWriteStrategy()`. All construction methods are synchronous and
 * do not perform network requests, metadata discovery, hidden global
 * registration, or environment lookup.
 */
export const fabricAdapterFactory: AdapterFactory = {
  adapterName: ADAPTER_NAME,

  createDataSource(config: unknown, name: string): DataSource {
    validateFabricConfig(config)

    const clientProps: {
      host: string
      port: number
      catalog: string
      auth:
        | {
            type: "oauth2"
            tenantId: string
            clientId: string
            clientSecret: string
            scope?: string
          }
        | { type: "bearer"; token: string }
      source?: string
    } = {
      host: config.host,
      port: config.port,
      catalog: config.catalog,
      auth: config.auth,
    }

    if (config.source !== undefined) {
      clientProps.source = config.source
    }

    const client = new FabricClient(clientProps)
    return new FabricDataSource(client, name)
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
      dialect: fabricDialect,
      normalizer: fabricResponseNormalizer,
      readValidation: paging
        ? { maxPerPage: paging.maxRecordsPerPage }
        : undefined,
      defaultPerPage: paging?.defaultPerPage,
    })
  },

  createWriteStrategy({
    dataSourceName,
  }: {
    dataSource: DataSource
    dataSourceName: string
    writeConfig: unknown
  }) {
    return new UnsupportedWriteStrategy({
      adapter: ADAPTER_NAME,
      dataSource: dataSourceName,
    })
  },
}

/**
 * Typed-config registration value compatible with
 * `AdapterDefinition<"fabric", FabricConnectionConfig>` from `@lakeql/config`
 * through structural typing.
 *
 * The adapter package does NOT import or depend on `@lakeql/config`. This
 * definition is consumed by `defineConfig()` to provide compile-time
 * connection-shape inference for Fabric data sources.
 *
 * Intentionally omits `registrationOptions` and `mergeDataSourceConfig`
 * because Fabric receives a complete explicit connection payload.
 */
export const fabricAdapterDefinition = {
  /** Literal adapter name for typed narrowing. */
  adapterName: ADAPTER_NAME,
  /** The exact adapter factory instance. */
  factory: fabricAdapterFactory,
  /** The shared assertion-style config validator. */
  validateDataSourceConfig: validateFabricConfig,
} as const
