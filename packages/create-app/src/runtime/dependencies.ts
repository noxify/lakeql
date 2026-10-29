import { writeFileSync } from "node:fs"
import path from "node:path"

import { installPackage } from "@antfu/install-pkg"

import { getBuildEnv } from "./build-env"

/**
 * Installs the generated project's dependencies.
 *
 * @param targetDir - The generated project directory.
 * @param packageManager - The chosen package manager (npm, pnpm, yarn).
 * @param localMode - When true, the project was scaffolded from a local
 *   template and keeps `workspace:*` versions, so it resolves against the
 *   surrounding monorepo. In that case we must NOT write a nested
 *   `pnpm-workspace.yaml` (it would isolate the project from the monorepo and
 *   break `workspace:*` resolution) and installation is left to the monorepo
 *   root.
 */
export async function installDependencies(
  targetDir: string,
  packageManager: string,
  localMode = false
): Promise<void> {
  // In local/dev mode the project is a member of the surrounding monorepo.
  // Installing it as an isolated workspace would break `workspace:*` links,
  // so dependency installation is the monorepo root's responsibility.
  if (localMode) {
    return
  }

  // pnpm requires allowBuilds for esbuild postinstall scripts
  if (packageManager === "pnpm") {
    writeFileSync(
      path.resolve(targetDir, "pnpm-workspace.yaml"),
      "allowBuilds:\n  esbuild: true\n"
    )
  }

  await installPackage([], {
    additionalArgs: installAdditionalArgs(packageManager),
    cwd: targetDir,
    packageManager,
    silent: true,
  })
}

/**
 * Extra install flags for the chosen package manager.
 *
 * During a `pkg.pr.new` preview build the generated `package.json` pins its
 * `@lakeql/*` dependencies to `pkg.pr.new` URLs, and those packages depend on
 * further `@lakeql/*` packages that are themselves URL-resolved. pnpm v10+
 * rejects such transitive URL dependencies by default
 * (`ERR_PNPM_EXOTIC_SUBDEP`), so the install must opt out via
 * `--config.block-exotic-subdeps=false`. A released build resolves every
 * dependency from npm with no exotic subdependencies, so the flag is only
 * emitted in preview mode.
 */
function installAdditionalArgs(packageManager: string): string[] {
  const { previewSha } = getBuildEnv()
  if (packageManager === "pnpm" && previewSha) {
    return ["--config.block-exotic-subdeps=false"]
  }

  return []
}
