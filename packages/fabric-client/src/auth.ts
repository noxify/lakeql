/**
 * Authentication module for the Fabric client.
 *
 * Translates the public {@link FabricAuth} configuration into a
 * {@link TokenCredential} usable by the `mssql` TDS driver's
 * `azure-active-directory-access-token` authentication mode.
 *
 * - `oauth2`: uses `@azure/identity`'s `ClientSecretCredential` to fetch
 *   access tokens for the Azure SQL / Fabric resource scope.
 * - `bearer`: wraps a caller-supplied token (e.g. an OBO token minted
 *   upstream) as a static credential.
 *
 * @module
 */

import { ClientSecretCredential } from "@azure/identity"

import { FabricClientError } from "./errors"
import type { FabricAuth } from "./types"

/**
 * Default OAuth2 scope for Azure SQL / Microsoft Fabric SQL endpoints.
 */
export const FABRIC_TOKEN_SCOPE = "https://database.windows.net/.default"

/**
 * A minimal token credential interface compatible with `@azure/identity`.
 *
 * Only the {@link TokenCredential.getToken} method is required by the client.
 */
export interface TokenCredential {
  /**
   * Fetches an access token for the given scope.
   *
   * @param scope - The OAuth2 scope to request a token for.
   * @returns A token and its expiry, or `null` if no token is available.
   */
  getToken: (
    scope: string
  ) => Promise<{ token: string; expiresOnTimestamp: number } | null>
}

/**
 * Resolves a {@link FabricAuth} configuration into a {@link TokenCredential}.
 *
 * @param auth - The authentication configuration from {@link FabricClientProps}.
 * @returns A token credential the client can use to authenticate the pool.
 * @throws {@link FabricClientError} when the auth type is not supported.
 */
export function resolveCredential(auth: FabricAuth): TokenCredential {
  switch (auth.type) {
    case "oauth2": {
      return new ClientSecretCredential(
        auth.tenantId,
        auth.clientId,
        auth.clientSecret
      ) as unknown as TokenCredential
    }
    case "bearer": {
      return createStaticCredential(auth.token)
    }
    default: {
      throw new FabricClientError(
        `Unsupported Fabric auth type: ${(auth as { type: string }).type}`
      )
    }
  }
}

/**
 * Wraps a static bearer token as a {@link TokenCredential}.
 *
 * The token is returned as-is with a far-future expiry so it is never
 * treated as expired for the lifetime of the client.
 *
 * @param token - The bearer token value.
 * @returns A credential that always yields the supplied token.
 */
function createStaticCredential(token: string): TokenCredential {
  const FAR_FUTURE_EXPIRY = Number.MAX_SAFE_INTEGER
  return {
    getToken: () =>
      Promise.resolve({ token, expiresOnTimestamp: FAR_FUTURE_EXPIRY }),
  }
}
