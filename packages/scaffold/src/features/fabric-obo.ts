/**
 * `fabric-obo` — adds the Fabric On-Behalf-Of (OBO) impersonation flow to an
 * existing project, so queries run as the calling user rather than the service
 * principal.
 *
 * The template contributes the `@azure/identity` dependency, the `OBO_*` env
 * vars + schema entries, and a static `src/fabric-impersonation-resolver.ts`. The
 * resolver keys off the adapter name (not a data-source name), so one file
 * serves every Fabric source. Wiring the resolver onto the data source and the
 * env schema are guidance-only (R5a): the template prints the exact edits and
 * the out-of-repo Azure follow-up instead of touching user-authored files.
 */

import type { Op } from "../ops"
import type { FeatureContext, FeatureResult, FeatureTemplate } from "./types"

/** npm package providing the Fabric adapter; its presence marks a Fabric project. */
const FABRIC_ADAPTER_PACKAGE = "@lakeql/adapter-fabric"

/** Exact `@azure/identity` version pinned to match the workspace (no caret). */
const AZURE_IDENTITY_VERSION = "4.14.1"

/** Default OBO scope for a Fabric Warehouse (Azure SQL Database). */
const DEFAULT_OBO_SCOPE = "https://database.windows.net/.default"

/** The OBO resolver, lifted verbatim from the fabric-only example. */
const IMPERSONATION_RESOLVER = `import { OnBehalfOfCredential } from "@azure/identity"
import type { ImpersonationResolver } from "@lakeql/config"

import { env } from "./env"

/**
 * Resolves per-request Fabric credentials using the OAuth2 On-Behalf-Of (OBO)
 * flow, so queries run as the calling user rather than the service principal.
 *
 * Flow:
 * 1. A Service Principal request (technical user) skips impersonation and
 *    falls back to the data source's configured service credentials.
 * 2. For a user request, the raw user token captured by the token resolver
 *    (\`currentUser.__rawToken\`) is exchanged — via a confidential OBO app
 *    (\`OBO_*\`) — for a Fabric-scoped bearer token.
 * 3. The exchanged token is returned as \`requestAuth\`, which the Fabric
 *    adapter uses as the bearer token for that request.
 *
 * Returning \`null\` means "no impersonation" — the request uses the configured
 * service credentials.
 */
export const fabricImpersonationResolver: ImpersonationResolver = async ({
  currentUser,
  isServicePrincipal,
  adapter,
}) => {
  // Technical users already authenticate as themselves; nothing to exchange.
  if (isServicePrincipal) {
    return null
  }

  // OBO only applies to Fabric sources; other adapters pass through.
  if (adapter !== "fabric") {
    return null
  }

  const userToken = currentUser.__rawToken as string | undefined
  if (!userToken) {
    // No user assertion to exchange — fall back to service credentials.
    return null
  }

  const credential = new OnBehalfOfCredential({
    tenantId: env.OBO_TENANT_ID,
    clientId: env.OBO_CLIENT_ID,
    clientSecret: env.OBO_CLIENT_SECRET,
    userAssertionToken: userToken,
  })

  const tokenResponse = await credential.getToken(env.OBO_FABRIC_SCOPE)
  if (!tokenResponse?.token) {
    return null
  }

  return { requestAuth: { type: "bearer", token: tokenResponse.token } }
}
`

/** Whether the project depends on the Fabric adapter package. */
function hasFabricAdapter(ctx: FeatureContext): boolean {
  const deps = {
    ...ctx.packageJson.dependencies,
    ...ctx.packageJson.devDependencies,
  }
  return FABRIC_ADAPTER_PACKAGE in deps
}

/**
 * Build the guidance-only wiring steps. The guidance is generic over data
 * sources: the user attaches the resolver to each of their Fabric sources,
 * which they can see directly in `lakeql.config.ts`. The template never reads
 * the config, so it names no specific source.
 */
function wiringSteps(): string[] {
  const importLine =
    "Add this import to lakeql.config.ts:\n" +
    '    import { fabricImpersonationResolver } from "./src/fabric-impersonation-resolver"'

  // The config property is always `impersonationResolver`; its value is the
  // adapter-prefixed export, so multiple adapters' resolvers can coexist.
  const attachProperty =
    "    impersonationResolver: fabricImpersonationResolver,"

  return [
    importLine,
    `Attach the resolver to each of your Fabric data sources in lakeql.config.ts by adding this property:\n${attachProperty}`,
  ]
}

/**
 * The `fabric-obo` feature template.
 *
 * Requires the Fabric adapter (`@lakeql/adapter-fabric`) as a project
 * dependency; otherwise `checkPreconditions` throws so the CLI boundary can
 * surface an actionable error and write nothing. The wiring guidance is generic
 * over data sources, so the template declares no inputs and reads no config.
 */
export const fabricOboTemplate: FeatureTemplate = {
  id: "fabric-obo",
  description:
    "Add the Fabric On-Behalf-Of (OBO) impersonation flow so queries run as the calling user.",

  checkPreconditions: (ctx) => {
    if (!hasFabricAdapter(ctx)) {
      throw new Error(
        `fabric-obo requires the Fabric adapter; add "${FABRIC_ADAPTER_PACKAGE}" to your project dependencies first.`
      )
    }
  },

  build: (): FeatureResult => {
    const ops: Op[] = [
      {
        type: "addDeps",
        deps: { "@azure/identity": AZURE_IDENTITY_VERSION },
      },
      {
        type: "addEnvVars",
        group: "On-Behalf-Of (OBO) for Fabric",
        vars: {
          OBO_CLIENT_ID: '"your-obo-client-id"',
          OBO_CLIENT_SECRET: '"your-obo-client-secret"',
          OBO_FABRIC_SCOPE: `"${DEFAULT_OBO_SCOPE}"`,
          OBO_TENANT_ID: '"your-obo-tenant-id"',
        },
      },
      {
        type: "addEnvSchema",
        schema: {
          OBO_CLIENT_ID: "string().min(1)",
          OBO_CLIENT_SECRET: "string().min(1)",
          OBO_FABRIC_SCOPE: `string().default("${DEFAULT_OBO_SCOPE}")`,
          OBO_TENANT_ID: "string().min(1)",
        },
      },
      {
        type: "addFile",
        path: "src/fabric-impersonation-resolver.ts",
        content: IMPERSONATION_RESOLVER,
      },
    ]

    const nextSteps: string[] = [
      ...wiringSteps(),
      "Copy the new OBO_* keys from .env.example into your .env and fill in the values from your OBO app registration.",
      'In Azure, register (or reuse) a confidential app for the OBO exchange and grant it delegated permissions: "Azure SQL Database" and "Azure Storage", each with "user_impersonation".',
      "Consent to those delegated permissions on first sign-in. If your tenant restricts user consent (or the scope is admin-restricted), an administrator must grant admin consent in the Azure portal.",
      `Set OBO_FABRIC_SCOPE to the scope your workload needs: "${DEFAULT_OBO_SCOPE}" for a Fabric Warehouse, or the Power BI scope "https://analysis.windows.net/powerbi/api/.default" for Lakehouse-only access.`,
    ]

    return { ops, nextSteps }
  },
}
