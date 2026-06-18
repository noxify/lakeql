import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { loadConfig as c12LoadConfig } from "c12"

import { CliError } from "@/errors"
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

const JSON_CONFIG_FILE = "lakeql.config.json"

function isJsonImportAttributeError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false
  }

  const maybeError = error as {
    code?: string
    message?: string
    cause?: { code?: string; message?: string }
  }

  const message = `${maybeError.message ?? ""} ${maybeError.cause?.message ?? ""}`

  return (
    maybeError.code === "ERR_IMPORT_ATTRIBUTE_MISSING" ||
    maybeError.cause?.code === "ERR_IMPORT_ATTRIBUTE_MISSING" ||
    message.includes('needs an import attribute of "type: json"')
  )
}

function normalizeConfig(config: Partial<LakeQLConfig>): LakeQLConfig {
  return {
    ...defaultConfig,
    ...config,
  }
}

async function loadJsonConfig(cwd: string): Promise<LakeQLConfig> {
  const configPath = path.join(cwd, JSON_CONFIG_FILE)
  const rawConfig = await readFile(configPath, "utf-8")
  const parsedConfig = JSON.parse(rawConfig) as Partial<LakeQLConfig>

  return normalizeConfig(parsedConfig)
}

/**
 * Loads the lakeql config using c12.
 * Supports .ts, .mjs, .js, .json formats.
 * Searches for: lakeql.config.{ts,mjs,js,json}
 */
export async function loadConfig(): Promise<LakeQLConfig> {
  const cwd = getInvocationCwd()

  try {
    const { config } = await c12LoadConfig<LakeQLConfig>({
      name: "lakeql",
      cwd,
      defaults: defaultConfig,
      packageJson: false,
      globalRc: false,
      rcFile: false,
      dotenv: false,
    })

    return normalizeConfig(config as Partial<LakeQLConfig>)
  } catch (error) {
    const configPath = path.join(cwd, JSON_CONFIG_FILE)

    if (isJsonImportAttributeError(error) && existsSync(configPath)) {
      return loadJsonConfig(cwd)
    }

    throw new CliError("Failed to load LakeQL config.", {
      code: "LAKEQL_CONFIG_LOAD_FAILED",
      hint: "Check lakeql.config.{ts,mjs,js,json} syntax and ensure exported values are valid.",
      details: [
        `Context: config loading from ${cwd}`,
        `Expected files: lakeql.config.ts, lakeql.config.mjs, lakeql.config.js, lakeql.config.json`,
      ],
      cause: error,
    })
  }
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
