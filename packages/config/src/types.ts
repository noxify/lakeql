import type {
  AdapterFactory,
  AdapterName,
  DataSource,
  DataSourceReadStrategy,
  DataSourceWriteStrategy,
  ResolveAuth,
} from "@lakeql/datasource"

import type {
  AuthConfig,
  ImpersonationResolver,
  Permission,
} from "./auth-types"
import type { ResolvedPaging } from "./define-config/resolve-paging"

/**
 * A single data-source entry within a loaded configuration.
 *
 * Each definition identifies the adapter that owns it and carries
 * opaque connection and write configuration values that are passed
 * through to the adapter factory without interpretation.
 */
export interface RuntimeDataSourceDefinition {
  /** Open name of the factory that owns this definition. */
  adapter: AdapterName

  /** Adapter-owned connection configuration passed only to createDataSource(). */
  connection: unknown

  /** Optional adapter-owned write configuration passed only to createWriteStrategy(). */
  writeConfig?: unknown

  /**
   * Optional per-data-source impersonation resolver.
   *
   * Takes precedence over the global `auth.impersonationResolver` when
   * resolving request-scoped credentials for this source. Passed through
   * as an opaque runtime object; never cloned or serialized.
   */
  impersonationResolver?: ImpersonationResolver

  /** The resolved per-data-source paging limits passed to the read strategy. */
  paging: ResolvedPaging
}

/**
 * Normalized configuration containing named data-source definitions
 * and application-level settings.
 *
 * Returned as part of a {@link LoadedLakeQLProject} from `loadConfig()`.
 * The config is serializable data-source metadata; non-serializable
 * runtime objects live in `connection` and `writeConfig` opaque fields.
 */
export interface LoadedLakeQLConfig {
  /** Named source definitions available to one runtime instance. */
  dataSources: Readonly<Record<string, RuntimeDataSourceDefinition>>

  /**
   * Base path for code generation (schemas, config-registry, etc.).
   * @default "."
   */
  sourcePath: string

  /**
   * Auth configuration for identity resolution and impersonation.
   * Passed through from `defineConfig()` without interpretation.
   */
  auth?: AuthConfig

  /**
   * Permission rules for technical users.
   * Passed through from `defineConfig()` without interpretation.
   */
  permissions?: Permission[]

  /**
   * Config-level paging defaults applied to data sources that do not supply
   * their own per-source override.
   */
  paging?: { defaultPerPage?: number; maxRecordsPerPage?: number }
}

/**
 * Complete project-level result returned by `loadConfig()`.
 *
 * Separates the serializable data-source definitions from the
 * non-serializable adapter factory list exported by the project
 * config module.
 */
export interface LoadedLakeQLProject {
  /** Normalized data-source definitions. */
  config: LoadedLakeQLConfig

  /** Adapter factories exported by the project config module. */
  adapters: readonly AdapterFactory[]
}

/**
 * Options accepted by `createLakeQLRuntime()` to compose a runtime
 * from loaded configuration, explicit adapter factories, and an
 * auth resolver.
 */
export interface CreateLakeQLRuntimeOptions {
  /** Loaded configuration containing named data-source definitions. */
  config: LoadedLakeQLConfig

  /** Adapter factories used to construct data sources and strategies. */
  adapters: readonly AdapterFactory[]

  /**
   * Auth resolution function injected into read strategies.
   *
   * Called during request processing to resolve credentials from
   * the request context for a given data-source name.
   */
  resolveAuth: ResolveAuth
}

/**
 * A composed LakeQL runtime that owns data-source instances, read
 * strategies, and write strategies created during composition.
 *
 * Accessors return the exact instances created for each configured
 * source name. The runtime is responsible for closing its owned
 * data sources through {@link LakeQLRuntime.close}.
 */
export interface LakeQLRuntime {
  /**
   * Returns the data-source instance for the given configured name.
   *
   * @param name - Configured source name.
   * @returns The data source created for this name during composition.
   * @throws {UnknownDataSourceError} When `name` is not a configured source.
   */
  getDataSource: (name: string) => DataSource

  /**
   * Returns the read-strategy instance for the given configured name.
   *
   * @param name - Configured source name.
   * @returns The read strategy created for this name during composition.
   * @throws {UnknownDataSourceError} When `name` is not a configured source.
   */
  getReadStrategy: (name: string) => DataSourceReadStrategy

  /**
   * Returns the write-strategy instance for the given configured name.
   *
   * @param name - Configured source name.
   * @returns The write strategy created for this name during composition.
   * @throws {UnknownDataSourceError} When `name` is not a configured source.
   * @throws {WriteStrategyNotConfiguredError} When the source exists but has no write strategy.
   */
  getWriteStrategy: (name: string) => DataSourceWriteStrategy

  /**
   * Releases all resources held by this runtime.
   *
   * Invokes `close()` on every owned data-source instance exactly once.
   * Subsequent calls return the same promise without closing data sources
   * again.
   *
   * @returns A promise that resolves when all owned data sources are closed.
   */
  close: () => Promise<void>
}
