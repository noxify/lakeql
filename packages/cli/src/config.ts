import path from "node:path"

import { loadConfig as c12LoadConfig } from "c12"

import { getInvocationCwd } from "@/path-utils"

export interface LakeQLConfig {
  /**
   * Base path for code generation (schemas, config-registry, etc.).
   * Relative paths are resolved from the project root (where the config file lives).
   * @default "."
   */
  sourcePath: string
}

const defaultConfig: LakeQLConfig = {
  sourcePath: ".",
}

/**
 * Loads the lakeql config using c12.
 * Supports .ts, .mjs, .js, .json formats.
 * Searches for: lakeql.config.{ts,mjs,js,json}
 */
export async function loadConfig(): Promise<LakeQLConfig> {
  const { config } = await c12LoadConfig<LakeQLConfig>({
    name: "lakeql",
    cwd: getInvocationCwd(),
    defaults: defaultConfig,
    packageJson: false,
    globalRc: false,
    rcFile: false,
    dotenv: false,
  })

  return config as LakeQLConfig
}

/**
 * Resolves the source path from config, with an optional CLI override.
 * CLI parameter takes precedence over config value.
 */
export async function resolveSourcePath(cliOverride?: string): Promise<string> {
  const config = await loadConfig()
  const cwd = getInvocationCwd()

  const sourcePath = cliOverride ?? config.sourcePath

  if (path.isAbsolute(sourcePath)) {
    return sourcePath
  }

  return path.resolve(cwd, sourcePath)
}
