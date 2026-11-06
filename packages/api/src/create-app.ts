/**
 * Convenience wrapper that turns a loaded LakeQL project config into a running
 * API server with a single call, while staying fully ejectable.
 *
 * `createLakeQLApp` encapsulates the wiring a generated `src/index.ts` would
 * otherwise hand-write: load the config, derive per-source auth metadata,
 * build the `ResolveAuth`, compose the runtime, and define the API server. The
 * expanded form is documented as the "eject" example and mirrors this module
 * byte for byte, so a user can inline it without surprises.
 *
 * @module
 */

import type {
  LakeQLRuntime,
  LoadedLakeQLProject,
  Permission,
} from "@lakeql/config"
import { createLakeQLRuntime, loadConfig } from "@lakeql/config"

import type { CorsOptions } from "./config"
import { defineApiConfig } from "./config"
import type { ApiErrorHook } from "./error-logging-plugin"
import type { ResolveAuthSourceInfo } from "./resolve-auth"
import { createApiResolveAuth } from "./resolve-auth"
import type {
  ReadPermissionResolver,
  WritePermissionResolver,
  YogaConfigOverrides,
} from "./types"

/**
 * The warning printed on startup when no permission rules are configured.
 *
 * Exported so the eject example and tests can assert the exact wording the
 * wrapper emits. Empty `auth.permissions` is a valid state, but it applies the
 * defaults, so surface it instead of leaving a silent gap.
 */
export const EMPTY_PERMISSIONS_WARNING =
  "No LakeQL permission rules configured. Defaults apply: human reads are delegated to each data source's own access control (e.g. Trino rules via impersonation, Fabric OBO), service-principal reads are denied, and all writes are denied until a matching Mutation rule is added. Ensure impersonation is configured — otherwise human queries run with the data source's service credentials."

/**
 * Options accepted by {@link createLakeQLApp}.
 *
 * Every option the hand-wired entry file exposes is forwarded here so a user
 * never has to eject just to tweak one knob. Server-shaping options map
 * directly onto {@link defineApiConfig}; `project` and `handleSignals` control
 * the wrapper itself.
 */
export interface CreateLakeQLAppOptions {
  /**
   * An already-loaded project (from `loadConfig()`). When omitted, the wrapper
   * calls `loadConfig()` itself with no arguments, matching the generated
   * entry file's default.
   */
  project?: LoadedLakeQLProject
  /**
   * Custom JWT token resolver. The one practically-required option, since auth
   * is runtime behavior the wrapper cannot infer from config.
   *
   * @default built-in mock auth
   */
  tokenResolver?: Parameters<typeof defineApiConfig>[0]["tokenResolver"]
  /**
   * Maps a JWT payload to a resolved identity.
   *
   * @default entraIdIdentityResolver
   */
  identityResolver?: Parameters<typeof defineApiConfig>[0]["identityResolver"]
  /**
   * Custom read permission resolver.
   *
   * @default built-in read permission check
   */
  hasReadPermission?: ReadPermissionResolver
  /**
   * Custom write permission resolver.
   *
   * @default built-in write permission check
   */
  hasWritePermission?: WritePermissionResolver
  /**
   * Permission rules for technical users.
   *
   * @default project.config.auth?.permissions ?? []
   */
  permissions?: Permission[]
  /**
   * CORS options for the GraphQL route. Off by default (same-origin only).
   */
  cors?: CorsOptions
  /**
   * Hook invoked for every GraphQL execution error after it is logged.
   */
  onError?: ApiErrorHook
  /**
   * Override GraphQL Yoga options.
   */
  yogaConfig?: YogaConfigOverrides
  /**
   * Server port.
   *
   * @default 4000
   */
  port?: number
  /**
   * Base directory for resolving relative paths.
   *
   * @default process.cwd()
   */
  baseDir?: string
  /** Path to query schema files (relative to `baseDir`). */
  schemaPath?: string
  /**
   * GraphQL endpoint path.
   *
   * @default "/graphql"
   */
  graphqlPath?: string
  /**
   * Health check endpoint path.
   *
   * @default "/live"
   */
  healthCheckEndpoint?: string
  /**
   * Register `SIGTERM`/`SIGINT` handlers that close the runtime and exit.
   *
   * When `true` (the default) the wrapper owns graceful shutdown, reproducing
   * the generated entry file. Set to `false` to own the lifecycle yourself via
   * the returned `close()`/`runtime`.
   *
   * @default true
   */
  handleSignals?: boolean
}

/**
 * The composed application returned by {@link createLakeQLApp}.
 *
 * Exposes the underlying runtime for advanced control plus `start`/`close`
 * lifecycle helpers.
 */
export interface LakeQLApp {
  /**
   * The composed runtime that owns data sources and read/write strategies.
   * Advanced callers can drive it directly.
   */
  runtime: LakeQLRuntime
  /**
   * Starts the HTTP server. Reproduces the generated entry file's startup
   * error handling: configuration-state errors (e.g. no schema files yet) are
   * printed without a stack trace and the process exits non-zero.
   *
   * @returns A promise that resolves once the server has started.
   */
  start: () => Promise<void>
  /**
   * Closes the runtime, releasing all data-source connections. Call this when
   * `handleSignals` is `false` and you own the lifecycle.
   *
   * @returns A promise that resolves when the runtime is closed.
   */
  close: () => Promise<void>
}

/**
 * Builds a ready-to-start LakeQL API server from a loaded project config.
 *
 * Encapsulates the full wiring the generated `src/index.ts` would otherwise
 * hand-write: it loads the config (unless `project` is supplied), derives the
 * per-source `sources` map and the global impersonation resolver, builds the
 * `ResolveAuth` via {@link createApiResolveAuth}, composes the runtime via
 * `createLakeQLRuntime`, and defines the server via {@link defineApiConfig}.
 *
 * Permissions default to `project.config.auth?.permissions ?? []` and can be
 * overridden via {@link CreateLakeQLAppOptions.permissions}. When the effective
 * rule set is empty, {@link EMPTY_PERMISSIONS_WARNING} is printed so the
 * default behavior is a deliberate choice, not a silent gap.
 *
 * @param options - Project source and server-shaping options. All optional.
 * @returns The composed {@link LakeQLApp} with `runtime`, `start`, and `close`.
 * @throws {Error} When `createLakeQLRuntime` rejects — for example a
 *   configured adapter name has no registered factory, two factories share a
 *   name, or a factory method fails while constructing a data source.
 */
export async function createLakeQLApp(
  options: CreateLakeQLAppOptions = {}
): Promise<LakeQLApp> {
  const { project: providedProject, handleSignals = true, ...rest } = options

  // Load the project config (adapters + data sources) unless one was passed in.
  const project = providedProject ?? (await loadConfig())

  // Derive per-source auth metadata (adapter + optional impersonation resolver)
  // from the loaded data sources. Empty until a data source is configured.
  const sources: Record<string, ResolveAuthSourceInfo> = Object.fromEntries(
    Object.entries(project.config.dataSources).map(([name, definition]) => [
      name,
      {
        adapter: definition.adapter,
        impersonationResolver: definition.impersonationResolver,
      },
    ])
  )

  const resolveAuth = createApiResolveAuth({
    sources,
    globalImpersonationResolver: project.config.auth?.impersonationResolver,
  })

  // Build the runtime that owns data sources and read/write strategies.
  const runtime = await createLakeQLRuntime({
    config: project.config,
    adapters: project.adapters,
    resolveAuth,
  })

  // Technical-user permission rules, declared on lakeql.config.ts under
  // `auth.permissions`. Absent/empty is a valid state, but it applies the
  // defaults: human reads are delegated to each data source's own access
  // control, service-principal reads are denied, and all writes are denied
  // until a matching Mutation rule is added. Warn so that fallback is a
  // deliberate choice, not a silent gap.
  const permissions = rest.permissions ?? project.config.auth?.permissions ?? []
  if (permissions.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(EMPTY_PERMISSIONS_WARNING)
  }

  // Compose the API server around the runtime.
  const server = defineApiConfig({
    runtime,
    tokenResolver: rest.tokenResolver,
    identityResolver: rest.identityResolver,
    hasReadPermission: rest.hasReadPermission,
    hasWritePermission: rest.hasWritePermission,
    permissions,
    cors: rest.cors,
    onError: rest.onError,
    yogaConfig: rest.yogaConfig,
    port: rest.port,
    baseDir: rest.baseDir,
    schemaPath: rest.schemaPath,
    graphqlPath: rest.graphqlPath,
    healthCheckEndpoint: rest.healthCheckEndpoint,
  })

  const close = async (): Promise<void> => {
    await runtime.close()
  }

  // Graceful shutdown: close all data-source connections, then exit.
  if (handleSignals) {
    const shutdown = async (): Promise<void> => {
      await close()
      process.exit(0)
    }
    process.on("SIGTERM", shutdown)
    process.on("SIGINT", shutdown)
  }

  const start = async (): Promise<void> => {
    try {
      await server.startServer()
    } catch (error) {
      // Startup errors (e.g. no schema files yet) are configuration states,
      // not crashes. Print the message without a stack trace and exit non-zero.
      // eslint-disable-next-line no-console
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }

  return { runtime, start, close }
}
