import type {
  IdentityResolver,
  LakeQLRuntime,
  Permission,
  TokenResolver,
} from "@lakeql/config"
import type { createLogger } from "@lakeql/logger"
import type { cors } from "hono/cors"

import type { ApiErrorHook } from "./error-logging-plugin"
import { startApiServer } from "./server"
import type {
  ReadPermissionResolver,
  WritePermissionResolver,
  YogaConfigOverrides,
} from "./types"
import { createYogaServer } from "./yoga"

/** Options for the GraphQL route's CORS middleware (Hono's `cors`). */
export type CorsOptions = Parameters<typeof cors>[0]

/**
 * Runtime configuration options for the LakeQL API server.
 */
export interface ApiRuntimeConfig {
  /**
   * Custom JWT token resolver.
   * @default built-in mock auth
   */
  tokenResolver?: TokenResolver
  /**
   * Maps a JWT payload to a ResolvedIdentity.
   * @default entraIdIdentityResolver
   */
  identityResolver?: IdentityResolver
  /**
   * Custom read permission resolver.
   * @default built-in read permission check
   */
  hasReadPermission?: ReadPermissionResolver
  /**
   * Custom write permission resolver.
   * @default built-in write permission check
   */
  hasWritePermission?: WritePermissionResolver
  /**
   * Override GraphQL Yoga options.
   *
   * @see {@link https://the-guild.dev/graphql/yoga-server/docs | GraphQL Yoga Docs}
   */
  yogaConfig?: YogaConfigOverrides
  /**
   * CORS options for the GraphQL route, applied by the Hono layer that wraps
   * Yoga. When omitted, CORS is not enabled (same-origin only). Set `origin` to
   * the front-ends allowed to call the API.
   *
   * A wildcard origin (`"*"`) cannot be combined with `credentials: true` — the
   * browser rejects that pairing — so there is no permissive default.
   *
   * @see {@link https://hono.dev/docs/middleware/builtin/cors | Hono CORS}
   */
  cors?: CorsOptions
  /**
   * Permission rules for technical users.
   * @default []
   */
  permissions?: Permission[]
  /**
   * The LakeQL runtime that owns data sources and read/write strategies.
   *
   * Built by the application (via `createLakeQLRuntime`) and passed in so
   * resolvers can resolve read strategies through the GraphQL context. The
   * API does not construct or own the runtime lifecycle.
   */
  runtime?: LakeQLRuntime
  /**
   * Base directory for resolving relative paths.
   * @default process.cwd()
   */
  baseDir?: string
  /** Path to query schema files (relative to baseDir). */
  schemaPath?: string
  /**
   * GraphQL endpoint path.
   * @default "/graphql"
   */
  graphqlPath?: string
  /**
   * Health check endpoint path.
   * @default "/live"
   */
  healthCheckEndpoint?: string
  /**
   * Server port.
   * @default 4000
   */
  port?: number
  /**
   * Hook invoked for every GraphQL execution error after it is logged. Use it
   * to forward errors to external telemetry (OpenTelemetry, Sentry, metrics)
   * without this package depending on any of them. Thrown errors from the hook
   * are swallowed so telemetry never breaks a response.
   */
  onError?: ApiErrorHook
}

/**
 * Configuration options for `defineApiConfig`.
 */
export type DefineConfigOptions = ApiRuntimeConfig

/**
 * The resolved API configuration returned by `defineApiConfig`. Carries every
 * {@link ApiRuntimeConfig} field through unchanged and adds the server helpers.
 */
export interface DefinedApiConfig extends ApiRuntimeConfig {
  createYogaServer: (
    logger: ReturnType<typeof createLogger>
  ) => ReturnType<typeof createYogaServer>
  startServer: () => ReturnType<typeof startApiServer>
}

/**
 * Defines the API server configuration with convenience methods
 * for creating a Yoga server or starting the full HTTP server.
 *
 * @param input - API runtime configuration options.
 * @returns A resolved configuration with `createYogaServer` and `startServer` helpers.
 */
export function defineApiConfig(input: DefineConfigOptions): DefinedApiConfig {
  const runtimeConfig: ApiRuntimeConfig = { ...input }

  return {
    ...runtimeConfig,
    createYogaServer(logger: ReturnType<typeof createLogger>) {
      return createYogaServer(logger, runtimeConfig)
    },
    startServer() {
      return startApiServer(runtimeConfig)
    },
  }
}
