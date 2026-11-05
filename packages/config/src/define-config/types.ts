// oxlint-disable typescript/no-explicit-any
// oxlint-disable typescript/method-signature-style

import type { AdapterFactory } from "@lakeql/datasource"

import type { AuthConfig, ImpersonationResolver } from "../auth-types"
import type { ResolvedPaging } from "./resolve-paging"

/**
 * Resolves the compile-time type of an `overrides` field from an adapter's
 * registration-level options type.
 *
 * An adapter that declares real registration options (a concrete object type
 * with at least one key) gets `Partial<TOptions>`, preserving per-field
 * autocomplete and type-checking. An adapter that declares no meaningful
 * options collapses to `never`, so `overrides` offers no keys and assigning
 * an arbitrary object is a type error instead of a silent no-op.
 *
 * "No meaningful options" covers three cases, all mapped to `never`:
 * - `unknown` — the default third type parameter of {@link AdapterDefinition},
 *   used by adapters (e.g. Trino, Fabric) that receive a complete explicit
 *   connection and declare no `registrationOptions`. Guarded by the
 *   `[keyof TOptions] extends [never]` check, since `keyof unknown` is `never`.
 *   The surrounding tuple (`[keyof TOptions]`) suppresses the special
 *   distributive behavior of a bare `unknown` in a conditional type.
 * - `never` — guarded first via `[TOptions] extends [never]`, because
 *   `keyof never` is `string | number | symbol` (not `never`) and would
 *   otherwise slip through as a has-keys type.
 * - an empty object type (`{}`-like) — `keyof {}` is `never`, so it maps to
 *   `never` as well; an empty options bag cannot carry real overrides.
 *
 * @template TOptions - The adapter's registration-level options type.
 */
export type OverridesFor<TOptions> = [TOptions] extends [never]
  ? never
  : [keyof TOptions] extends [never]
    ? never
    : Partial<TOptions>

/**
 * Input shape passed to an adapter's `mergeDataSourceConfig()` function.
 *
 * Contains the data-source connection value, optional write configuration,
 * and optional overrides scoped to the adapter's registration options.
 *
 * @template TConnection - The adapter-owned connection configuration type.
 * @template TRegistrationOptions - The adapter's registration-level options type.
 */
export interface DataSourceConfigInput<
  TConnection,
  TRegistrationOptions = unknown,
> {
  /** The data-source connection value before merge processing. */
  connection: TConnection
  /** Optional adapter-owned write configuration passed through unchanged. */
  writeConfig?: unknown
  /**
   * Optional overrides scoped to registration-level option fields.
   *
   * Typed via {@link OverridesFor}: an adapter with real registration options
   * accepts `Partial<TRegistrationOptions>`, while an adapter that declares no
   * options (`TRegistrationOptions` is `unknown`, `never`, or an empty object)
   * collapses this field to `never`, so no meaningful override can be set.
   */
  overrides?: OverridesFor<TRegistrationOptions>
}

/**
 * Result returned by an adapter's `mergeDataSourceConfig()` function.
 *
 * Contains the merged connection value and optional write configuration.
 * The `connection` is subsequently passed to `validateDataSourceConfig()`.
 *
 * @template TConnection - The adapter-owned connection configuration type.
 */
export interface MergedDataSourceConfig<TConnection> {
  /** The merged connection value ready for validation. */
  connection: TConnection
  /** Optional adapter-owned write configuration after merge processing. */
  writeConfig?: unknown
}

/**
 * Typed adapter definition that combines an adapter's public name,
 * factory reference, registration options, validation, and optional
 * custom merge logic.
 *
 * Adapter packages expose definitions implementing this interface to
 * register with `defineConfig()`. The definition provides the type
 * information necessary for TypeScript inference of data-source
 * configuration without requiring global module augmentation.
 *
 * @template TName - The literal adapter name string.
 * @template TDataSourceConfig - The adapter-owned connection configuration type.
 * @template TRegistrationOptions - Optional registration-level default options type.
 * @template TWriteConfig - The adapter-owned write configuration type. Defaults
 *   to `never`, so an adapter that declares no `validateWriteConfig` makes
 *   `writeConfig` uninhabited (only `undefined` is assignable) at the config
 *   call site.
 */
export interface AdapterDefinition<
  TName extends string,
  TDataSourceConfig,
  TRegistrationOptions = unknown,
  TWriteConfig = never,
> {
  /** Unique adapter name matching `factory.adapterName`. */
  readonly adapterName: TName
  /** The `AdapterFactory` reference for downstream runtime composition. */
  readonly factory: AdapterFactory
  /** Optional adapter-level default options applied to all data sources using this adapter. */
  readonly registrationOptions?: TRegistrationOptions

  /**
   * Validates the merged connection value.
   *
   * Receives only the connection value (after merge processing).
   * Must throw for invalid configuration.
   *
   * @param config - The merged connection value to validate.
   */
  validateDataSourceConfig(config: unknown): asserts config is TDataSourceConfig

  /**
   * Optional assertion that pins the adapter's `writeConfig` type at the
   * config call site.
   *
   * When declared, its `asserts config is TWriteConfig` signature makes
   * `defineConfig()` infer `TWriteConfig` for this adapter, narrowing the
   * `writeConfig` field of the adapter's data-source entries. When omitted,
   * `TWriteConfig` stays `never` and `writeConfig` accepts only `undefined`.
   *
   * This carries the compile-time type only; runtime validation of
   * `writeConfig` remains the responsibility of the adapter factory's
   * `createWriteStrategy`.
   *
   * @param config - The adapter-owned write configuration to validate.
   */
  validateWriteConfig?(config: unknown): asserts config is TWriteConfig

  /**
   * Optional custom merge function that owns the entire merge for a data source.
   *
   * Called synchronously before `validateDataSourceConfig()`. When declared,
   * the default shallow-merge path is skipped entirely.
   *
   * @param registrationOptions - The adapter's registration-level options, or `undefined` if absent.
   * @param sourceConfig - The data-source input containing connection, writeConfig, and overrides.
   * @returns The merged result with connection and optional writeConfig.
   */
  mergeDataSourceConfig?: (
    registrationOptions: TRegistrationOptions | undefined,
    sourceConfig: DataSourceConfigInput<TDataSourceConfig, TRegistrationOptions>
  ) => MergedDataSourceConfig<TDataSourceConfig>
}

/**
 * Typed input shape for a single data source within `defineConfig()`.
 *
 * Uses distributive conditional inference over the adapter tuple to narrow
 * `adapter`, `connection`, and `overrides` based on the selected adapter.
 * This is the INPUT shape accepted by the `dataSources` map; the normalized
 * output shape (`NormalizedDataSourceEntry`) omits `overrides`.
 *
 * @template TAdapter - An `AdapterDefinition` union from which fields are inferred.
 */
export type DataSourceEntry<
  TAdapter extends AdapterDefinition<string, any, any, any>,
> =
  TAdapter extends AdapterDefinition<
    infer TName,
    infer TConnection,
    infer TOptions,
    infer TWriteConfig
  >
    ? {
        /** The adapter name selecting which registered adapter handles this data source. */
        adapter: TName
        /** The adapter-specific connection configuration value. */
        connection: TConnection
        /** Optional adapter-owned write configuration, typed per adapter. */
        writeConfig?: TWriteConfig
        /**
         * Optional overrides scoped to the adapter's registration-level option
         * fields.
         *
         * Typed via {@link OverridesFor}: an adapter with real registration
         * options accepts `Partial<TOptions>`, while an adapter that declares
         * no options (`TOptions` is `unknown`, `never`, or an empty object)
         * collapses this field to `never` so assigning an arbitrary object is a
         * type error rather than a silent no-op.
         */
        overrides?: OverridesFor<TOptions>
        /** Optional per-data-source impersonation resolver, taking precedence over the global one. */
        impersonationResolver?: ImpersonationResolver
        /**
         * Optional prefix prepended to every generated GraphQL name for this
         * source, case-normalized per target context at generation time. Used
         * to disambiguate sources that expose same-named tables. Unset leaves
         * generated names unchanged.
         */
        namePrefix?: string
        /** Optional page size used when a request omits `perPage`. Must be a positive integer. */
        defaultPerPage?: number
        /** Optional upper bound a request's `perPage` may not exceed. Must be a positive integer. */
        maxRecordsPerPage?: number
      }
    : never

/**
 * Constrains the `dataSources` map so that each entry's `adapter` field is
 * limited to the union of registered adapter names, and config fields are
 * narrowed to the corresponding adapter's types.
 *
 * @template TAdapters - The readonly tuple of registered `AdapterDefinition` objects.
 */
export type DataSourcesFor<
  TAdapters extends readonly AdapterDefinition<string, any, any, any>[],
> = Record<string, DataSourceEntry<TAdapters[number]>>

/**
 * Normalized output shape for a single data source after merge processing.
 *
 * Unlike the input `DataSourceEntry`, this type omits `overrides` (consumed
 * during merge) and marks all fields `readonly`. It is used inside
 * `TypedLakeQLConfig` as the value type of the normalized `dataSources` map.
 *
 * @template TAdapter - An `AdapterDefinition` union from which fields are inferred.
 */
export type NormalizedDataSourceEntry<
  TAdapter extends AdapterDefinition<string, any, any, any>,
> =
  TAdapter extends AdapterDefinition<
    infer TName,
    infer TConnection,
    infer _TOptions,
    infer TWriteConfig
  >
    ? {
        /** The adapter name that processed this data source. */
        readonly adapter: TName
        /** The merged connection value after defaults/overrides processing. */
        readonly connection: TConnection
        /** Optional adapter-owned write configuration, typed per adapter. */
        readonly writeConfig?: TWriteConfig
        /** Optional per-data-source impersonation resolver, taking precedence over the global one. */
        readonly impersonationResolver?: ImpersonationResolver
        /** Optional prefix prepended to every generated GraphQL name for this source. */
        readonly namePrefix?: string
        /** The resolved per-data-source paging limits. */
        readonly paging: ResolvedPaging
      }
    : never

/**
 * Readonly record mapping data-source names to their normalized entries.
 *
 * This is the OUTPUT type used in `TypedLakeQLConfig.dataSources`, distinct
 * from the input `DataSourcesFor` type which carries `overrides`.
 *
 * @template TAdapters - The readonly tuple of registered `AdapterDefinition` objects.
 */
export type NormalizedDataSourcesFor<
  TAdapters extends readonly AdapterDefinition<string, any, any, any>[],
> = Readonly<Record<string, NormalizedDataSourceEntry<TAdapters[number]>>>

/**
 * The return type of `defineConfig()`.
 *
 * Contains the identity-preserved adapter definitions, a normalized
 * readonly data-sources map, and the unified application-level config
 * fields (auth, sourcePath) shared by API and CLI.
 *
 * @template TAdapters - The readonly tuple of registered `AdapterDefinition` objects.
 */
export interface TypedLakeQLConfig<
  TAdapters extends readonly AdapterDefinition<string, any, any, any>[],
> {
  /** The registered adapter definitions, identity-preserved in registration order. */
  adapters: TAdapters
  /** Normalized data-source map with merged connections and no overrides. */
  dataSources: NormalizedDataSourcesFor<TAdapters>
  /**
   * Base path for code generation (schemas, config-registry, etc.).
   * The CLI resolves a relative value against the command invocation directory
   * (`INIT_CWD` when run via a package-manager script, otherwise the current
   * working directory).
   * @default "."
   */
  sourcePath: string
  /**
   * Auth configuration grouping the global impersonation fallback and
   * technical-user permission rules. Used by the API layer at runtime.
   */
  auth?: AuthConfig
  /**
   * Config-level paging defaults applied to every data source that does not
   * supply its own per-source override. Each field must be a positive integer.
   */
  paging?: { defaultPerPage?: number; maxRecordsPerPage?: number }
}
