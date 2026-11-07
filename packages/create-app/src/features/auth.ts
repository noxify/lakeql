/**
 * Authentication feature definitions.
 * Generates auth.ts, env vars, and deps based on the selected strategy.
 */

import type { Op } from "@lakeql/scaffold"
import dedent from "dedent"

const MOCK_AUTH_FILE = dedent`
  import type { TokenResolver } from "@lakeql/config"

  import { env } from "./env"

  export const tokenResolver: TokenResolver = async (request) => {
    const authHeader = request.headers.get("authorization")

    if (!authHeader) {
      return null
    }

    if (env.AUTH_MOCK && authHeader === env.AUTH_MOCK_TOKEN) {
      return {
        userName: "testuser",
      }
    }

    return null
  }
`

const ENTRA_ID_AUTH_FILE = dedent`
  import type { TokenResolver } from "@lakeql/config"
  import { createRemoteJWKSet, jwtVerify } from "jose"

  import { env } from "./env"

  const JWKS = env.AUTH_TENANT_ID
    ? createRemoteJWKSet(
        new URL(
          \`https://login.microsoftonline.com/\${env.AUTH_TENANT_ID}/discovery/v2.0/keys\`
        )
      )
    : null

  export const tokenResolver: TokenResolver = async (request) => {
    const authHeader = request.headers.get("authorization")

    if (!authHeader?.startsWith("Bearer ")) {
      return null
    }

    if (!JWKS) {
      return null
    }

    const token = authHeader.slice(7)
    if (!token) {
      return null
    }

    try {
      const { payload } = await jwtVerify(token, JWKS, {
        audience: env.AUTH_CLIENT_ID,
        issuer: \`https://login.microsoftonline.com/\${env.AUTH_TENANT_ID}/v2.0\`,
        clockTolerance: 0,
      })

      return {
        ...payload,
        __rawToken: token,
      }
    } catch {
      return null
    }
  }
`

const CUSTOM_AUTH_FILE = dedent`
  import type { TokenResolver } from "@lakeql/config"

  /**
   * Resolves the caller's identity from the incoming request.
   *
   * Implement your own authentication here — for example verify a JWT from a
   * provider such as Auth0 or Keycloak, validate an API key, or look up a
   * session. Return a payload describing the user when authenticated, or
   * \`null\` to reject the request as unauthenticated.
   *
   * Read any configuration you need from \`./env\` (add the variables to
   * \`src/env.ts\` and \`.env\`).
   */
  export const tokenResolver: TokenResolver = async (request) => {
    const authHeader = request.headers.get("authorization")

    if (!authHeader) {
      return null
    }

    // TODO: implement your authentication logic and return the resolved user.
    return null
  }
`

export function opsForAuth(strategyId: string): Op[] {
  // Env vars are scoped to the chosen strategy: mock auth gets the mock token
  // vars, entra-id gets the tenant var. Only the selected strategy's vars are
  // emitted, so the generated .env.example and env schema stay focused.
  const ops: Op[] = []

  if (strategyId === "entra-id") {
    ops.push(
      { type: "addDeps", deps: { jose: "^6.0.0" } },
      {
        type: "addEnvVars",
        group: "Authentication - Entra ID",
        vars: {
          AUTH_TENANT_ID: '""',
          AUTH_CLIENT_ID: '""',
        },
      },
      {
        type: "addEnvSchema",
        schema: {
          AUTH_TENANT_ID: "string().min(1)",
          AUTH_CLIENT_ID: "string().min(1)",
        },
      },
      {
        type: "addFile",
        path: "src/auth.ts",
        content: `${ENTRA_ID_AUTH_FILE}\n`,
      }
    )
  } else if (strategyId === "custom") {
    // Custom: only the typed boilerplate. No auth-specific env vars or deps —
    // the user adds whatever their implementation needs.
    ops.push({
      type: "addFile",
      path: "src/auth.ts",
      content: `${CUSTOM_AUTH_FILE}\n`,
    })
  } else {
    ops.push(
      {
        type: "addEnvVars",
        group: "Authentication - Mock",
        vars: {
          AUTH_MOCK: "true",
          AUTH_MOCK_TOKEN: '"dev-token-1234"',
        },
      },
      {
        type: "addEnvSchema",
        schema: {
          AUTH_MOCK: "coerce.boolean().default(false)",
          AUTH_MOCK_TOKEN: "string().optional()",
        },
      },
      {
        type: "addFile",
        path: "src/auth.ts",
        content: `${MOCK_AUTH_FILE}\n`,
      }
    )
  }

  return ops
}
