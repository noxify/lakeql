import type { AdapterName, SourceConfig } from "./adapter"
import type { DataSourceCapabilities } from "./capabilities"
import type { ColumnInfo, QueryProps, TableDefinition } from "./metadata"
import type { TypeMapper } from "./type-mapper"

/**
 * Adapter-neutral data source contract.
 *
 * Every adapter package implements this interface to provide query
 * execution, streaming, metadata discovery, DDL, and lifecycle
 * management without coupling the core to adapter-specific details.
 */
export interface DataSource {
  /** Open adapter identifier for this data source instance. */
  readonly adapter: AdapterName

  /** Capabilities supported by this data source. */
  readonly capabilities: DataSourceCapabilities

  /** Maps between this adapter's engine types and LakeQL primitive types. */
  readonly typeMapper: TypeMapper

  /**
   * Executes a SQL query and returns all matching rows.
   *
   * @template TRow - Shape of each row returned by the data source.
   * @param props - SQL text, optional cancellation signal, request auth, and adapter options.
   * @returns All rows produced by the query.
   */
  query: <TRow>(props: QueryProps) => Promise<TRow[]>

  /**
   * Executes a SQL query and returns its rows as an asynchronous generator.
   *
   * @template TRow - Shape of each row yielded by the data source.
   * @param props - SQL text, optional cancellation signal, request auth, and adapter options.
   * @returns A generator that yields rows in source order.
   */
  stream: <TRow>(props: QueryProps) => Promise<AsyncGenerator<TRow>>

  /**
   * Lists catalogs available to the current data source.
   *
   * @returns Catalog names visible to the configured connection.
   */
  catalogs: () => Promise<string[]>

  /**
   * Lists schemas within a catalog.
   *
   * @param catalog - Catalog whose schemas should be listed.
   * @returns Schema names in the catalog.
   */
  schemas: (catalog: string) => Promise<string[]>

  /**
   * Lists tables within a catalog and schema.
   *
   * @param catalog - Catalog containing the schema.
   * @param schema - Schema whose tables should be listed.
   * @returns Table names in the schema.
   */
  tables: (catalog: string, schema: string) => Promise<string[]>

  /**
   * Lists views within a catalog and schema.
   *
   * @param catalog - Catalog containing the schema.
   * @param schema - Schema whose views should be listed.
   * @returns View names in the schema.
   */
  views: (catalog: string, schema: string) => Promise<string[]>

  /**
   * Lists column metadata for a table.
   *
   * @param catalog - Catalog containing the table.
   * @param schema - Schema containing the table.
   * @param table - Table whose columns should be listed.
   * @returns Metadata for the table's columns.
   */
  columns: (
    catalog: string,
    schema: string,
    table: string
  ) => Promise<ColumnInfo[]>

  /**
   * Creates a table from a neutral definition.
   *
   * @param definition - Target coordinates and ordered column definitions.
   */
  createTable: (definition: TableDefinition) => Promise<void>

  /**
   * Drops a table.
   *
   * @param catalog - Catalog containing the table.
   * @param schema - Schema containing the table.
   * @param table - Table to drop.
   */
  dropTable: (catalog: string, schema: string, table: string) => Promise<void>

  /**
   * Builds an adapter-specific fully qualified table name.
   *
   * @param config - Source coordinates to qualify.
   * @returns The data-source-specific qualified table name.
   */
  qualifiedTableName: (config: SourceConfig) => string

  /** Releases all resources held by this data source. */
  close: () => Promise<void>
}
