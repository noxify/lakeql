import type { createLogger } from "@lakeql/logger"

import type { SchemaConfigEntry } from "./helpers"
import { startApiServer } from "./server"
import type {
  GetUserResolver,
  Permission,
  ReadPermissionResolver,
  WritePermissionResolver,
  YogaConfigOverrides,
} from "./types"
import { createYogaServer } from "./yoga"

export interface ApiRuntimeConfig {
  getUser?: GetUserResolver
  hasReadPermission?: ReadPermissionResolver
  hasWritePermission?: WritePermissionResolver
  maxRecordsPerPage?: number
  yogaConfig?: YogaConfigOverrides
  permissions?: Permission[]
  baseDir?: string
  schemaPath?: string
  graphqlPath?: string
  healthCheckEndpoint?: string
  port?: number
}

export interface DefineConfigOptions<
  TConfig extends readonly SchemaConfigEntry[],
> extends ApiRuntimeConfig {
  allConfigs: TConfig
}

function isDefineConfigOptions(
  input:
    | readonly SchemaConfigEntry[]
    | DefineConfigOptions<readonly SchemaConfigEntry[]>
): input is DefineConfigOptions<readonly SchemaConfigEntry[]> {
  return !Array.isArray(input)
}

export interface DefinedApiConfig<
  TConfig extends readonly SchemaConfigEntry[],
> {
  getUser?: GetUserResolver
  hasReadPermission?: ReadPermissionResolver
  hasWritePermission?: WritePermissionResolver
  maxRecordsPerPage?: number
  yogaConfig?: YogaConfigOverrides
  permissions?: Permission[]
  baseDir?: string
  schemaPath?: string
  graphqlPath?: string
  healthCheckEndpoint?: string
  port?: number
  allConfigs: TConfig
  createYogaServer: (
    logger: ReturnType<typeof createLogger>
  ) => ReturnType<typeof createYogaServer>
  startServer: () => ReturnType<typeof startApiServer>
}

export function defineConfig<
  const TConfig extends readonly SchemaConfigEntry[],
>(input: TConfig | DefineConfigOptions<TConfig>): DefinedApiConfig<TConfig> {
  let allConfigs: readonly SchemaConfigEntry[]
  let runtimeConfig: ApiRuntimeConfig

  if (isDefineConfigOptions(input)) {
    ;({ allConfigs } = input)
    runtimeConfig = {
      baseDir: input.baseDir,
      getUser: input.getUser,
      graphqlPath: input.graphqlPath,
      hasReadPermission: input.hasReadPermission,
      hasWritePermission: input.hasWritePermission,
      healthCheckEndpoint: input.healthCheckEndpoint,
      maxRecordsPerPage: input.maxRecordsPerPage,
      permissions: input.permissions,
      port: input.port,
      schemaPath: input.schemaPath,
      yogaConfig: input.yogaConfig,
    }
  } else {
    allConfigs = input
    runtimeConfig = {}
  }

  return {
    ...runtimeConfig,
    allConfigs: allConfigs as TConfig,
    createYogaServer(logger: ReturnType<typeof createLogger>) {
      return createYogaServer(logger, runtimeConfig)
    },
    startServer() {
      return startApiServer(runtimeConfig)
    },
  }
}

export type ConfigEntry<
  T extends DefinedApiConfig<readonly SchemaConfigEntry[]>,
> = T["allConfigs"][number]
