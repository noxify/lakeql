/**
 * Auth and permission types for the unified LakeQL configuration.
 *
 * These types are owned by `@lakeql/config` because they are consumed
 * by both the API and CLI layers. They are transport-neutral — the
 * config package does not interpret JWT, HTTP, or GraphQL details.
 */

/**
 * JWT-like payload. A plain record from a decoded token.
 */
export type JWTPayload = Record<string, unknown>

/**
 * Resolved identity information from a JWT token.
 */
export interface ResolvedIdentity {
  /** The resolved user name from the token. */
  userName: string
  /** Whether this request originates from a Service Principal (technical user). */
  isServicePrincipal: boolean
  /** The raw user token (for OBO flows). */
  userToken?: string
}

/**
 * Maps a JWT payload to a ResolvedIdentity.
 * Can be sync or async to support custom identity providers.
 */
export type IdentityResolver = (
  token: JWTPayload
) => ResolvedIdentity | Promise<ResolvedIdentity>

/**
 * Resolves the current user from an incoming request.
 * Returns the JWT payload or null/undefined when unauthenticated.
 */
export type TokenResolver = (
  req: Request
) => Promise<JWTPayload | null | undefined> | JWTPayload | null | undefined

/**
 * Resolves impersonation credentials for a given user and adapter context.
 */
export type ImpersonationResolver = (context: {
  currentUser: JWTPayload
  isServicePrincipal: boolean
  dataSource: string
  adapter: string
}) => Promise<{
  requestAuth?: { type: string; token: string } | undefined
  options?: Record<string, unknown>
} | null>

/**
 * Permission rule entry defining catalog, schema, and table access.
 */
export interface PermissionRule {
  /** Optional catalog filter. If omitted, matches any catalog. */
  catalog?: string
  /** Schema to match, or "*" for all schemas. */
  schema: string
  /** Tables to match, or ["*"] for all tables in the schema. */
  tables: string[]
}

/**
 * Permission rule for a technical user, defining which dataSources/tables they can read and write.
 */
export interface Permission {
  /** Username to match against `currentUser.userName`. */
  name: string
  /** Whether this user's queries run via a system user (no impersonation). */
  useSystemUser: boolean
  /** Read and write access rules. */
  permissions: {
    /** Read access rules. Use `["*"]` for wildcard table access. */
    Query: {
      dataSource: string
      rules: PermissionRule[]
    }[]
    /** Write access rules. Use `["*"]` for wildcard table access. */
    Mutation: {
      dataSource: string
      rules: PermissionRule[]
    }[]
  }
}

/**
 * Auth configuration block for the unified config.
 *
 * Groups the config-level auth concerns: the global impersonation fallback
 * and the technical-user permission rules. Request authentication
 * (`tokenResolver`) and identity resolution (`identityResolver`) are
 * API-server concerns configured on `defineApiConfig` (`ApiRuntimeConfig`),
 * not here, because they run per HTTP request; permissions are declarative
 * data and belong with the rest of the project configuration.
 */
export interface AuthConfig {
  /**
   * Global fallback impersonation resolver, applied across every data source.
   *
   * This is the source-independent counterpart to a per-source
   * `dataSources.<source>.impersonationResolver`. Resolution is two-level: for
   * a given data source the per-source resolver takes precedence, and this
   * global resolver is used only when that source defines none. When neither
   * exists, the request runs with no impersonation (system user / the source's
   * configured service credentials).
   *
   * Use the per-source field to override impersonation for a specific source,
   * and this field to apply one resolver to all sources that do not.
   */
  impersonationResolver?: ImpersonationResolver

  /**
   * Permission rules for technical users, defining which data sources and
   * tables each may read and write. Declared here in `defineConfig` and read
   * by the application wiring, which forwards them to the API server
   * (`defineApiConfig`) where the authorization checks consume them.
   */
  permissions?: Permission[]
}
