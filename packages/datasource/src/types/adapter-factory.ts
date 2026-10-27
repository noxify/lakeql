import type { AdapterName } from "./adapter"
import type { ResolveAuth } from "./auth"
import type { DataSource } from "./datasource"
import type { DataSourceReadStrategy, ReadStrategyPaging } from "./read"
import type { DataSourceWriteStrategy } from "./write"

/**
 * Adapter factory contract.
 *
 * Every adapter package exposes a single factory that the runtime
 * uses to construct a data source, read strategy, and write strategy
 * without adapter-specific switch statements.
 *
 * Config parameters use `unknown` to keep the core free of
 * adapter-specific type imports. Adapter factories own validation
 * and narrowing of their configuration objects.
 *
 * Environment-based connection configuration is NOT part of this
 * contract. If an adapter needs environment parsing, it provides
 * a separate config-layer provider that feeds the central config
 * loader.
 */
export interface AdapterFactory {
  /** Unique adapter identifier (e.g. `"trino"`, `"fabric"`). */
  readonly adapterName: AdapterName

  /**
   * Constructs an adapter-owned data source from validated adapter-specific
   * configuration and its configured runtime name.
   *
   * @param config - Adapter-specific configuration to validate and consume.
   * @param name - Configured runtime name for the new data source.
   * @returns A data source owned by this adapter.
   */
  createDataSource: (config: unknown, name: string) => DataSource

  /**
   * Constructs a read strategy with its data source and auth resolver.
   *
   * @param args - The data source and request-auth resolver required by the strategy.
   * @returns A read strategy owned by this adapter.
   */
  createReadStrategy: (args: {
    /** Data source used to execute reads. */
    dataSource: DataSource
    /** Resolves credentials from the request context. */
    resolveAuth: ResolveAuth
    /**
     * Resolved per-data-source paging limits from config. Optional so
     * existing/third-party implementers and test stubs stay valid.
     */
    paging?: ReadStrategyPaging
  }) => DataSourceReadStrategy

  /**
   * Constructs a write strategy from adapter-owned configuration.
   *
   * @param args - The data source, its configured name, and write configuration.
   * @returns A write strategy owned by this adapter.
   */
  createWriteStrategy: (args: {
    /** Data source used to execute writes. */
    dataSource: DataSource
    /** Configured runtime name of the data source. */
    dataSourceName: string
    /** Validated adapter-specific write configuration. */
    writeConfig: unknown
  }) => DataSourceWriteStrategy
}
