/**
 * Builds the `ResolveAuth` function the app injects into
 * `createLakeQLRuntime`. It closes over the configured impersonation
 * resolvers and resolves request-scoped credentials per request using the
 * GraphQL context.
 *
 * Two-level resolution: a per-data-source `impersonationResolver` takes
 * precedence over the global one. When neither exists, no credentials are
 * produced (system user).
 *
 * @module
 */

import type {
  ImpersonationResolver,
  JWTPayload,
  ResolvedIdentity,
} from "@lakeql/config"
import type { DataSourceAuth, ResolveAuth } from "@lakeql/datasource"

/**
 * Per-data-source metadata needed to resolve impersonation:
 * the adapter name and an optional per-source impersonation resolver.
 */
export interface ResolveAuthSourceInfo {
  /** Open adapter name owning this data source. */
  adapter: string
  /** Optional per-data-source impersonation resolver. */
  impersonationResolver?: ImpersonationResolver
}

/**
 * Configuration for {@link createApiResolveAuth}.
 */
export interface CreateApiResolveAuthOptions {
  /**
   * Per-data-source metadata keyed by configured source name. Typically
   * derived from `project.config.dataSources` (adapter + optional
   * per-source impersonationResolver).
   */
  sources: Readonly<Record<string, ResolveAuthSourceInfo>>
  /** Global fallback impersonation resolver (from `auth.impersonationResolver`). */
  globalImpersonationResolver?: ImpersonationResolver
}

/**
 * Per-request auth context expected in the opaque `context` passed to the
 * read strategy. The API builds this as the GraphQL context.
 */
export interface ApiAuthContext {
  /** Decoded JWT payload, or null when unauthenticated. */
  currentUser: JWTPayload | null
  /** Resolved identity, or null when unauthenticated. */
  identity: ResolvedIdentity | null
}

/**
 * Adapts an {@link ImpersonationResolver} result to the neutral
 * {@link DataSourceAuth} shape.
 *
 * The impersonation contract returns `requestAuth: { type: string; token }`.
 * A `"bearer"` type maps to a bearer credential; a `"oauth2"` type maps to
 * an OAuth2 access token. Unknown types are rejected.
 */
function adaptRequestAuth(
  requestAuth: { type: string; token: string } | undefined
): DataSourceAuth | undefined {
  if (requestAuth === undefined) {
    return undefined
  }

  if (requestAuth.type === "bearer") {
    return { type: "bearer", token: requestAuth.token }
  }

  if (requestAuth.type === "oauth2") {
    return { type: "oauth2", accessToken: requestAuth.token }
  }

  throw new Error(
    `Impersonation resolver returned unsupported requestAuth type "${requestAuth.type}". ` +
      `Supported types: "bearer", "oauth2".`
  )
}

/**
 * Creates the `ResolveAuth` function for the API runtime.
 *
 * The returned function resolves the effective impersonation resolver for a
 * data source (per-source, then global), invokes it with the current user
 * from the request context, and returns neutral `{ requestAuth, options }`
 * for the read strategy. When no resolver applies or there is no
 * authenticated user, it returns an empty result (system user).
 *
 * @param options - Per-source metadata and the global impersonation resolver.
 * @returns A `ResolveAuth` suitable for `createLakeQLRuntime`.
 */
export function createApiResolveAuth(
  options: CreateApiResolveAuthOptions
): ResolveAuth {
  const { sources, globalImpersonationResolver } = options

  return async (dataSourceName, context) => {
    const sourceInfo = sources[dataSourceName]

    // Two-level resolution: per-source resolver wins, else global.
    const resolver =
      sourceInfo?.impersonationResolver ?? globalImpersonationResolver

    if (resolver === undefined) {
      return {}
    }

    const authContext = context as ApiAuthContext | undefined
    const currentUser = authContext?.currentUser
    if (!currentUser) {
      // No authenticated user → system user, no request-scoped credentials.
      return {}
    }

    const result = await resolver({
      currentUser,
      isServicePrincipal: authContext?.identity?.isServicePrincipal ?? false,
      dataSource: dataSourceName,
      adapter: sourceInfo?.adapter ?? "",
    })

    if (result === null) {
      return {}
    }

    const requestAuth = adaptRequestAuth(result.requestAuth)

    return {
      ...(requestAuth === undefined ? {} : { requestAuth }),
      ...(result.options === undefined ? {} : { options: result.options }),
    }
  }
}
