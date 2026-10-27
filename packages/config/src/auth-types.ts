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
 */
export interface AuthConfig {
  /** Resolves the current user from an incoming request. */
  tokenResolver?: TokenResolver
  /** Maps a JWT payload to a ResolvedIdentity. */
  identityResolver?: IdentityResolver
  /** Custom impersonation resolver. */
  impersonationResolver?: ImpersonationResolver
}
