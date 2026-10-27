/**
 * Authentication credentials for a Fabric connection.
 */
export type FabricAuth =
  | {
      /** OAuth2 client credentials flow. */
      type: "oauth2"
      /** Azure AD tenant ID. */
      tenantId: string
      /** Azure AD application (client) ID. */
      clientId: string
      /** Azure AD client secret. */
      clientSecret: string
      /** Optional scope override. */
      scope?: string
    }
  | {
      /** Static bearer token. */
      type: "bearer"
      /** Bearer token value. */
      token: string
    }

/**
 * Configuration for creating a {@link FabricClient}.
 */
export interface FabricClientProps {
  /** Fabric SQL endpoint hostname. */
  host: string
  /** Fabric SQL endpoint port. */
  port: number
  /** Default catalog (database) for queries. */
  catalog: string
  /** Authentication credentials. */
  auth: FabricAuth
  /** Source identifier for diagnostics. */
  source?: string
}

/**
 * Properties for executing a SQL query.
 */
export interface QueryProps {
  /** SQL statement to execute. */
  sql: string
  /** Optional cancellation signal. */
  signal?: AbortSignal
  /** Optional bearer token for OBO (on-behalf-of) flow. */
  bearerToken?: string
}
