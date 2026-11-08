import path from "node:path"

import { CliError } from "@/errors"
import { getInvocationCwd } from "@/path-utils"

/** Default env file loaded when `--env` is given without a value. */
export const DEFAULT_ENV_FILE = ".env"

/**
 * Loads an env file into `process.env` using Node's built-in `.env` parser
 * (`process.loadEnvFile`) — no third-party dotenv dependency and no custom
 * parsing. Relative paths resolve against the command invocation directory
 * (`INIT_CWD` when run via a package-manager script, otherwise `process.cwd()`).
 *
 * Because the file is requested explicitly via `--env`, a missing or unreadable
 * file is a hard error rather than a silent skip.
 *
 * @param envPath - The env file path (relative or absolute).
 * @throws {CliError} When the file cannot be loaded.
 */
export function loadEnvFile(envPath: string): void {
  const resolved = path.isAbsolute(envPath)
    ? envPath
    : path.resolve(getInvocationCwd(), envPath)

  try {
    process.loadEnvFile(resolved)
  } catch (error) {
    throw new CliError(`Could not load env file "${envPath}".`, {
      code: "ENV_FILE_NOT_LOADED",
      hint: `Checked '${resolved}'. Pass a readable file via --env, or omit --env to use the existing environment.`,
      cause: error,
    })
  }
}

/**
 * Resolves the `--env` option value into an env file path, or `undefined` when
 * no env file should be loaded.
 *
 * @param env - The parsed `--env` value: `undefined` (absent), `true` (flag
 *   without a value), or a string path.
 * @returns The path to load, or `undefined` to load nothing.
 */
export function resolveEnvOption(
  env: string | boolean | undefined
): string | undefined {
  if (env === undefined || env === false) {
    return undefined
  }
  return env === true ? DEFAULT_ENV_FILE : env
}

/**
 * Loads the env file selected by a command's `--env` option, if any.
 *
 * Intended to run before a command reads `lakeql.config.ts`, so a config that
 * references `env.*` resolves its values.
 *
 * @param env - The parsed `--env` option value.
 */
export function applyEnvOption(env: string | boolean | undefined): void {
  const envPath = resolveEnvOption(env)
  if (envPath !== undefined) {
    loadEnvFile(envPath)
  }
}
