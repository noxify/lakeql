import type { AdapterName, SourceConfig } from "../types/adapter"
import type { DataSourceCapabilities } from "../types/capabilities"
import type { DataSource } from "../types/datasource"
import type { ColumnInfo, QueryProps, TableDefinition } from "../types/metadata"
import type { PrimitiveType, TypeMapper } from "../types/type-mapper"

/**
 * Minimal fake `DataSource` implementation for testing.
 *
 * All methods return no-op stubs. Does not import `@lakeql/config`
 * or any concrete adapter package.
 */
export class FakeDataSource implements DataSource {
  readonly adapter: AdapterName = "fake"

  readonly capabilities: DataSourceCapabilities = {
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
      modes: ["full_load", "append"],
    },
    ddl: {
      createTable: true,
      dropTable: true,
    },
  }

  readonly typeMapper: TypeMapper = {
    toPrimitiveType: (_engineType: string): PrimitiveType => "String",
    toEngineType: (primitiveType: PrimitiveType): string => primitiveType,
  }

  // eslint-disable-next-line class-methods-use-this
  query<TRow>(_props: QueryProps): Promise<TRow[]> {
    return Promise.resolve([])
  }

  // eslint-disable-next-line class-methods-use-this
  async *_streamGenerator<TRow>(): AsyncGenerator<TRow> {
    // yields nothing
  }

  stream<TRow>(_props: QueryProps): Promise<AsyncGenerator<TRow>> {
    return Promise.resolve(this._streamGenerator<TRow>())
  }

  // eslint-disable-next-line class-methods-use-this
  catalogs(): Promise<string[]> {
    return Promise.resolve([])
  }

  // eslint-disable-next-line class-methods-use-this
  schemas(_catalog: string): Promise<string[]> {
    return Promise.resolve([])
  }

  // eslint-disable-next-line class-methods-use-this
  tables(_catalog: string, _schema: string): Promise<string[]> {
    return Promise.resolve([])
  }

  // eslint-disable-next-line class-methods-use-this
  views(_catalog: string, _schema: string): Promise<string[]> {
    return Promise.resolve([])
  }

  // eslint-disable-next-line class-methods-use-this
  columns(
    _catalog: string,
    _schema: string,
    _table: string
  ): Promise<ColumnInfo[]> {
    return Promise.resolve([])
  }

  // eslint-disable-next-line class-methods-use-this
  createTable(_definition: TableDefinition): Promise<void> {
    return Promise.resolve()
  }

  // eslint-disable-next-line class-methods-use-this
  dropTable(_catalog: string, _schema: string, _table: string): Promise<void> {
    return Promise.resolve()
  }

  // eslint-disable-next-line class-methods-use-this
  qualifiedTableName(config: SourceConfig): string {
    return `${config.catalog}.${config.schema}.${config.tableName}`
  }

  // eslint-disable-next-line class-methods-use-this
  close(): Promise<void> {
    return Promise.resolve()
  }
}
