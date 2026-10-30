import path from "node:path"

/**
 * The directory a user ran the command from.
 *
 * When invoked through a package-manager script (e.g. `pnpm --filter … dev`),
 * the process is `chdir`-ed into the package directory, so `process.cwd()`
 * points at the package, not where the user stands. npm and pnpm expose the
 * original directory via `INIT_CWD`; prefer it so relative `--local` and
 * `--target-dir` paths resolve against the user's shell location. Falls back
 * to `process.cwd()` when the CLI is run directly (no `INIT_CWD`).
 */
export function invocationCwd(): string {
  // INIT_CWD is a package-manager runtime variable (npm/pnpm), not part of the
  // validated application env, so it is read directly from process.env.
  // oxlint-disable-next-line no-restricted-properties
  return process.env.INIT_CWD ?? process.cwd()
}

/**
 * Resolves the `--local [path]` option into an absolute template directory,
 * or `undefined` for the default (remote) mode.
 *
 * - absent / `false` → `undefined` (remote download)
 * - `true` (flag without value) → `<cwd>/templates/app`
 * - `<path>` → resolved against cwd, treated as the template directory
 *
 * @param local - The parsed `--local` option value.
 * @param cwd - Base directory to resolve against (defaults to the invocation
 *   directory: `INIT_CWD` when set, otherwise `process.cwd()`).
 */
export function resolveLocalTemplateDir(
  local: string | boolean | undefined,
  cwd: string = invocationCwd()
): string | undefined {
  if (local === undefined || local === false) {
    return undefined
  }
  if (local === true) {
    return path.resolve(cwd, "templates/app")
  }
  return path.resolve(cwd, local)
}

/**
 * Resolves the destination project directory from the optional `--target-dir`
 * option and the project name.
 *
 * The project is always created inside `<target-dir>/<project-name>`, where
 * `--target-dir` is the parent directory (default: the current directory).
 *
 * @param targetDir - The parsed `--target-dir` option value (parent directory).
 * @param projectName - The project directory name.
 * @param cwd - Base directory to resolve against (defaults to the invocation
 *   directory: `INIT_CWD` when set, otherwise `process.cwd()`).
 * @returns The absolute path to the project directory.
 */
export function resolveTargetDir(
  targetDir: string | undefined,
  projectName: string,
  cwd: string = invocationCwd()
): string {
  const baseDir = targetDir ? path.resolve(cwd, targetDir) : cwd
  return path.resolve(baseDir, projectName)
}
