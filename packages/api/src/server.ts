import type { AddressInfo } from "node:net"
import path from "node:path"

import { serve } from "@hono/node-server"
import { createLogger } from "@lakeql/logger"
import dedent from "dedent"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger as honoLogger } from "hono/logger"

import type { ApiRuntimeConfig } from "./config"
import { env } from "./env"
import { createYogaServer, serveYoga } from "./yoga"

const generateUrl = (url: string, info: AddressInfo) =>
  new URL(url, `http://localhost:${info.port}`).toString()

export interface ApiServer {
  app: Hono
  logger: ReturnType<typeof createLogger>
  yoga: Awaited<ReturnType<typeof createYogaServer>>
}

export const createApiServer = async (
  options: ApiRuntimeConfig = {}
): Promise<ApiServer> => {
  const logger = createLogger()
  const customLogger = (message: string, ...rest: string[]) => {
    logger.info(message, ...rest)
  }

  const yoga = await createYogaServer(logger, options)

  const app = new Hono()
  const graphqlPath = options.graphqlPath ?? "/graphql"

  app.use("*", honoLogger(customLogger))

  app.on(
    ["POST", "GET", "OPTIONS"],
    `${graphqlPath}/*`,
    cors({
      allowHeaders: ["content-type", "authorization"],
      allowMethods: ["POST", "GET", "OPTIONS"],
      credentials: true,
      origin: "*",
    }),
    serveYoga({ yoga })
  )

  return {
    app,
    logger,
    yoga,
  }
}

export const startApiServer = async (options: ApiRuntimeConfig = {}) => {
  const { app, yoga } = await createApiServer(options)

  serve(
    {
      fetch: app.fetch,
      port: options.port ?? env.API_PORT,
    },
    (info) => {
      // eslint-disable-next-line no-console
      console.log(
        dedent(`
          * Server URL: ${generateUrl("/", info)}
          * GraphQL Endpoint: ${generateUrl(yoga.graphqlEndpoint, info)}
        `)
      )
    }
  )
}

const currentFilePath = import.meta.filename
const executedFilePath = process.argv[1]
  ? path.resolve(process.argv[1])
  : undefined

if (executedFilePath === currentFilePath) {
  await startApiServer()
}
