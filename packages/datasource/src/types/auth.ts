/**
 * Neutral authentication types for data source access.
 *
 * These types live in `@lakeql/datasource` (design decision 4) because
 * they are required by the adapter factory and read strategy contracts.
 */

/**
 * Discriminated union of authentication credentials that can be
 * transported through the core without adapter-specific knowledge.
 *
 * The set of variants may be extended by a future auth design, but
 * the core must carry request auth without interpreting adapter-level
 * credential details.
 */
export type DataSourceAuth =
  | {
      /** Username and password credentials. */
      type: "basic"
      /** Username sent to the data source. */
      username: string
      /** Password sent to the data source. */
      password: string
    }
  | {
      /** Static bearer token credentials. */
      type: "bearer"
      /** Token sent in the authorization header. */
      token: string
    }
  | {
      /** OAuth 2.0 access-token credentials. */
      type: "oauth2"
      /** Current OAuth 2.0 access token. */
      accessToken: string
    }

/**
 * Auth resolution function injected into read strategies and adapter
 * factories. Given a data source name and an opaque request context,
 * it returns optional credentials and adapter-level options.
 *
 * @param dataSourceName - Configured runtime name of the data source.
 * @param context - Opaque request context from which credentials can be resolved.
 * @returns Credentials and adapter-owned options for the request, when available.
 */
export type ResolveAuth = (
  dataSourceName: string,
  context: unknown
) => Promise<{
  /** Credentials to attach to the data-source request. */
  requestAuth?: DataSourceAuth
  /** Adapter-owned request options. */
  options?: Record<string, unknown>
}>
