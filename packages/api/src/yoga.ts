import type { createLogger } from "@lakeql/logger"
import { initContextCache } from "@pothos/core"
import { createYoga } from "graphql-yoga"
import type { MiddlewareHandler } from "hono"

import {
  tokenResolver as defaultTokenResolver,
  hasReadPermission,
  hasWritePermission,
} from "./auth"
import type { ApiRuntimeConfig } from "./config"
import { env } from "./env"
import { createErrorLoggingPlugin } from "./error-logging-plugin"
import { entraIdIdentityResolver } from "./identity"
import { loadSchema } from "./schema"

export interface ApiYoga {
  fetch: ReturnType<typeof createYoga>["fetch"]
  graphqlEndpoint: string
}

export async function createYogaServer(
  logger: ReturnType<typeof createLogger>,
  options: ApiRuntimeConfig = {}
): Promise<ApiYoga> {
  const resolveToken = options.tokenResolver ?? defaultTokenResolver
  const resolveIdentity = options.identityResolver ?? entraIdIdentityResolver
  const hasReadPermissionResolver =
    options.hasReadPermission ?? hasReadPermission
  const hasWritePermissionResolver =
    options.hasWritePermission ?? hasWritePermission
  const yogaConfig = options.yogaConfig ?? {}
  const permissions = options.permissions ?? []

  const schema = await loadSchema({
    baseDir: options.baseDir,
    schemaPath: options.schemaPath,
  })

  const { runtime } = options

  return createYoga({
    context: async ({ request }) => {
      const currentUser = await resolveToken(request)
      const identity = currentUser ? await resolveIdentity(currentUser) : null

      return {
        ...initContextCache(),
        currentUser: currentUser ?? null,
        identity,
        hasReadPermission: hasReadPermissionResolver,
        hasWritePermission: hasWritePermissionResolver,
        logger,
        permissions,
        getReadStrategy: (name: string) => {
          if (!runtime) {
            throw new Error(
              `Cannot resolve read strategy for "${name}": the API was configured without a runtime. ` +
                `Pass a runtime to defineApiConfig.`
            )
          }
          return runtime.getReadStrategy(name)
        },
        getWriteStrategy: runtime
          ? (name: string) => runtime.getWriteStrategy(name)
          : undefined,
      }
    },
    graphiql: env.NODE_ENV === "development",
    healthCheckEndpoint:
      options.healthCheckEndpoint ?? yogaConfig.healthCheckEndpoint ?? "/live",
    landingPage: false,
    logging: env.API_LOGGER === "silent" ? false : env.API_LOGGER,
    maskedErrors: true,
    schema,
    ...yogaConfig,
    // Keep LakeQL's error-logging plugin even when yogaConfig provides its own;
    // set after the spread so user plugins are appended, not replaced.
    plugins: [
      createErrorLoggingPlugin(logger, options.onError),
      ...(yogaConfig.plugins ?? []),
    ],
  }) as ApiYoga
}

export function serveYoga({ yoga }: { yoga: ApiYoga }): MiddlewareHandler {
  // oxlint-disable-next-line require-await
  return async (c, next) => {
    if (c.finalized) {
      return next()
    }
    const req = c.req.raw

    return yoga.fetch(
      req,
      {
        body: c.req.raw.body,
        headers: c.req.header(),
        method: c.req.method,
      },
      c
    )
  }
}
