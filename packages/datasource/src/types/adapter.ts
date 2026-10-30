/**
 * Open adapter name type.
 *
 * Adapter identifiers are plain strings so that third-party adapters
 * do not require changes to a central union type.
 */
export type AdapterName = string

/**
 * Shared source configuration that identifies a table within a
 * data source without coupling to adapter-specific connection details.
 */
export interface SourceConfig {
  /** Runtime name of the configured data source. */
  dataSource: string
  /** Open identifier of the adapter that owns this source. */
  adapter: AdapterName
  /** Source catalog containing the target table. */
  catalog: string
  /** Source schema containing the target table. */
  schema: string
  /** Name of the target table. */
  tableName: string
}
