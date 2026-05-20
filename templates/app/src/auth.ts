import type { GetUserResolver } from "@lakeql/api/types"

import { env } from "./env"

export const getUser: GetUserResolver = async (request) => {
  const authHeader = request.headers.get("authorization")

  if (authHeader) {
    // dummy implementation to test it locally without setting up a real authentication provider
    // in a real implementation, you would verify the token and extract user information from it ;)
    if (env.AUTH_MOCK && authHeader === env.AUTH_MOCK_TOKEN) {
      return {
        // maybe you have to change the username to a valid one
        // The configured username will be used for the permission checks
        // and also for the impersonation of the user in the data source connectors,
        userName: "testuser",
      }
    }
    // reject requests with invalid token or mock auth is disabled
    return null
  }

  // reject unauthenticated requests
  return null
}
