import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { getInvocationCwd } from "@/path-utils"

export interface LakeQLConfig {
  /**
   * Base path for code generation (schemas, config-registry, etc.).
   * Relative paths are resolved from the project root (where lakeql.config.json lives).
   * @default "."
   */
  sourcePath: string
}

const CONFIG_FILE_NAME = "lakeql.config.json"

const defaultConfig: LakeQLConfig = {
  sourcePath: ".",
}

/**
 * Loads the lakeql.config.json from the invocation directory.
 * Returns default values if the config file doesn't exist.
 */
export function loadConfig(): LakeQLConfig {
  const configPath = path.join(getInvocationCwd(), CONFIG_FILE_NAME)

  if (!existsSync(configPath)) {
    return defaultConfig
  }

  const raw = readFileSync(configPath, "utf-8")
  const parsed = JSON.parse(raw) as Partial<LakeQLConfig>

  return {
    ...defaultConfig,
    ...parsed,
  }
}

/**
 * Resolves the source path from config, with an optional CLI override.
 * CLI parameter takes precedence over config value.
 */
export function resolveSourcePath(cliOverride?: string): string {
  const config = loadConfig()
  const cwd = getInvocationCwd()

  const sourcePath = cliOverride ?? config.sourcePath

  if (path.isAbsolute(sourcePath)) {
    return sourcePath
  }

  return path.resolve(cwd, sourcePath)
}

export { CONFIG_FILE_NAME }
