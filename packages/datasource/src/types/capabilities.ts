/**
 * Describes actual support for operations, metadata discovery, write
 * modes, and DDL provided by a data source.
 *
 * Adapters populate this at construction time so that the runtime can
 * avoid selecting unsupported operations.
 */
export interface DataSourceCapabilities {
  /** Whether the data source supports query execution. */
  query: boolean

  /** Whether the data source supports streaming results. */
  stream: boolean

  /** Metadata discovery support per catalog object type. */
  metadata: {
    /** Whether catalog discovery is supported. */
    catalogs: boolean
    /** Whether schema discovery is supported. */
    schemas: boolean
    /** Whether table discovery is supported. */
    tables: boolean
    /** Whether view discovery is supported. */
    views: boolean
    /** Whether column discovery is supported. */
    columns: boolean
  }

  /** Write support and available write modes. */
  write: {
    supported: boolean
    /**
     * Available write modes — an open string array so that future
     * adapters can provide modes not known to the core.
     */
    modes: string[]
  }

  /** DDL support. */
  ddl: {
    /** Whether creating tables is supported. */
    createTable: boolean
    /** Whether dropping tables is supported. */
    dropTable: boolean
  }
}
