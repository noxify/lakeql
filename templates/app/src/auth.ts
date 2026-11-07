import type { TokenResolver } from "@lakeql/config"

import { env } from "./env"

/**
 * Resolves the current user from an incoming request.
 *
 * This is a mock implementation for local development. Replace it with real
 * token verification (e.g. validating a JWT and extracting the user) before
 * deploying. The returned `userName` is used for permission checks and for
 * impersonation against the configured data sources.
 */
export const tokenResolver: TokenResolver = (request) => {
  const authHeader = request.headers.get("authorization")

  if (!authHeader) {
    // Reject unauthenticated requests.
    return null
  }

  if (env.AUTH_MOCK && authHeader === env.AUTH_MOCK_TOKEN) {
    return {
      userName: "testuser",
    }
  }

  // Reject invalid tokens (or when mock auth is disabled).
  return null
}
