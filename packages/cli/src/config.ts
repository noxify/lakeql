import path from "node:path"

import type { LoadedLakeQLProject } from "@lakeql/config"
import { loadConfig as loadProjectConfig } from "@lakeql/config"

import { CliError } from "@/errors"
import { getInvocationCwd } from "@/path-utils"

export type { LoadedLakeQLConfig, LoadedLakeQLProject } from "@lakeql/config"

let cachedProject: LoadedLakeQLProject | undefined

/**
 * Loads and caches the LakeQL project configuration.
 *
 * Wraps `@lakeql/config`'s `loadConfig()` with CLI-specific error messages.
 * Subsequent calls return the cached result without re-reading the config file.
 */
export async function loadConfig(): Promise<LoadedLakeQLProject> {
  if (cachedProject) {
    return cachedProject
  }

  const cwd = getInvocationCwd()
  try {
    cachedProject = await loadProjectConfig({ cwd })
    return cachedProject
  } catch (error) {
    const causeMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error"

    throw new CliError(`Failed to load LakeQL config: ${causeMessage}`, {
      code: "LAKEQL_CONFIG_LOAD_FAILED",
      hint: "Check lakeql.config.{ts,mts,js,mjs} syntax and ensure exported values are valid.",
      details: [`Context: config loading from ${cwd}`],
      cause: error,
    })
  }
}

/**
 * Resolves the source path from config, with an optional CLI override.
 * CLI parameter takes precedence over config value.
 */
export async function resolveSourcePath(cliOverride?: string): Promise<string> {
  const cwd = getInvocationCwd()

  if (cliOverride) {
    if (path.isAbsolute(cliOverride)) {
      return cliOverride
    }
    return path.resolve(cwd, cliOverride)
  }

  const project = await loadConfig()
  const sourcePath = project.config.sourcePath ?? "."

  if (path.isAbsolute(sourcePath)) {
    return sourcePath
  }

  return path.resolve(cwd, sourcePath)
}
