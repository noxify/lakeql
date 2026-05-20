import { defineConfig } from "@lakeql/api/config"

import { getUser } from "./auth"
import { allConfigs } from "./config-registry"
import { permissions } from "./permissions"

const baseDir = import.meta.dirname

export const config = defineConfig({
  allConfigs,
  baseDir,
  getUser,
  graphqlPath: "/graphql",
  healthCheckEndpoint: "/live",
  permissions,
  port: 4000,
  schemaPath: "./schemas",
})
