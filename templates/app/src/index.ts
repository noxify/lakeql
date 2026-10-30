import { defineApiConfig } from "@lakeql/api/config"
import { createApiResolveAuth } from "@lakeql/api/resolve-auth"
import type { ResolveAuthSourceInfo } from "@lakeql/api/resolve-auth"
import { createLakeQLRuntime, loadConfig } from "@lakeql/config"

import { tokenResolver } from "./auth"
import { permissions } from "./permissions"

const baseDir = import.meta.dirname

// Load the project config (adapters + data sources) from lakeql.config.ts.
const project = await loadConfig()

// Derive per-source auth metadata (adapter + optional impersonation resolver)
// from the loaded data sources. Empty until a data source is configured.
const sources: Record<string, ResolveAuthSourceInfo> = Object.fromEntries(
  Object.entries(project.config.dataSources).map(([name, definition]) => [
    name,
    {
      adapter: definition.adapter,
      impersonationResolver: definition.impersonationResolver,
    },
  ])
)

const resolveAuth = createApiResolveAuth({
  sources,
  globalImpersonationResolver: project.config.auth?.impersonationResolver,
})

// Build the runtime that owns data sources and read/write strategies.
const runtime = await createLakeQLRuntime({
  config: project.config,
  adapters: project.adapters,
  resolveAuth,
})

// Compose the API server around the runtime.
const server = defineApiConfig({
  runtime,
  tokenResolver,
  permissions,
  baseDir,
  schemaPath: "./schemas",
  graphqlPath: "/graphql",
  healthCheckEndpoint: "/live",
})

// Graceful shutdown: close all data-source connections.
const shutdown = async (): Promise<void> => {
  await runtime.close()
  process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

try {
  await server.startServer()
} catch (error) {
  // Startup errors (e.g. no schema files yet) are configuration states, not
  // crashes. Print the message without a stack trace and exit non-zero.
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
