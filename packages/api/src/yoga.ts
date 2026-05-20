import type { createLogger } from "@lakeql/logger"
import { initContextCache } from "@pothos/core"
import { createYoga } from "graphql-yoga"
import type { MiddlewareHandler } from "hono"

import { getUser, hasReadPermission, hasWritePermission } from "./auth"
import { setMaxRecordsPerPage } from "./builder"
import type { ApiRuntimeConfig } from "./config"
import { env } from "./env"
import { loadSchema } from "./schema"

export interface ApiYoga {
  fetch: ReturnType<typeof createYoga>["fetch"]
  graphqlEndpoint: string
}

export async function createYogaServer(
  logger: ReturnType<typeof createLogger>,
  options: ApiRuntimeConfig = {}
): Promise<ApiYoga> {
  const getUserResolver = options.getUser ?? getUser
  const hasReadPermissionResolver =
    options.hasReadPermission ?? hasReadPermission
  const hasWritePermissionResolver =
    options.hasWritePermission ?? hasWritePermission
  const yogaConfig = options.yogaConfig ?? {}
  const permissions = options.permissions ?? []

  setMaxRecordsPerPage(options.maxRecordsPerPage)

  const schema = await loadSchema({
    baseDir: options.baseDir,
    schemaPath: options.schemaPath,
  })

  return createYoga({
    context: async ({ request }) => ({
      ...initContextCache(),
      currentUser: await getUserResolver(request),
      hasReadPermission: hasReadPermissionResolver,
      hasWritePermission: hasWritePermissionResolver,
      logger,
      permissions,
    }),
    graphiql: env.NODE_ENV === "development",
    healthCheckEndpoint:
      options.healthCheckEndpoint ?? yogaConfig.healthCheckEndpoint ?? "/live",
    landingPage: false,
    logging: env.API_LOGGER === "silent" ? false : env.API_LOGGER,
    maskedErrors: true,
    schema,
    ...yogaConfig,
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
