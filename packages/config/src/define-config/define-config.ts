// oxlint-disable typescript/no-explicit-any

import type { AuthConfig, Permission } from "../auth-types"
import { processDataSources } from "./process-data-sources"
import type {
  AdapterDefinition,
  DataSourcesFor,
  TypedLakeQLConfig,
} from "./types"
import { validateAdapters } from "./validate-adapters"
import { validateInput } from "./validate-input"

/**
 * Validates and normalizes a typed LakeQL configuration.
 *
 * Accepts an explicit adapter list, a data-source map, and optional
 * application-level config (auth, permissions, sourcePath). Validates
 * registrations and individual data-source configurations, merges
 * defaults/overrides, and returns a `TypedLakeQLConfig` with
 * identity-preserved adapters and a normalized `dataSources` map.
 *
 * This is the single point of truth (SPOT) for LakeQL configuration.
 * Both the API and CLI consume the same config object.
 *
 * This function is pure and stateless — it does not read project files,
 * create runtime instances, or accumulate module-level state.
 */
export function defineConfig<
  const TAdapters extends readonly AdapterDefinition<string, any, any, any>[],
>(config: {
  adapters: TAdapters
  dataSources: DataSourcesFor<TAdapters>
  /**
   * Base path for code generation (schemas, config-registry, etc.).
   * The CLI resolves a relative value against the command invocation directory
   * (`INIT_CWD` when run via a package-manager script, otherwise the current
   * working directory).
   * @default "."
   */
  sourcePath?: string
  /**
   * Auth configuration for identity resolution and impersonation.
   */
  auth?: AuthConfig
  /**
   * Permission rules for technical users.
   */
  permissions?: Permission[]
  /**
   * Config-level paging defaults applied to every data source that does not
   * supply its own per-source override.
   */
  paging?: { defaultPerPage?: number; maxRecordsPerPage?: number }
}): TypedLakeQLConfig<TAdapters> {
  validateInput(config)
  validateAdapters(
    config.adapters as unknown as readonly Record<string, unknown>[]
  )

  const normalizedDataSources = processDataSources(
    config.dataSources as unknown as Record<string, unknown>,
    config.adapters as unknown as readonly Record<string, unknown>[],
    config.paging
  )

  return {
    adapters: config.adapters,
    dataSources: normalizedDataSources,
    sourcePath: config.sourcePath ?? ".",
    auth: config.auth,
    permissions: config.permissions,
    paging: config.paging,
  } as TypedLakeQLConfig<TAdapters>
}
