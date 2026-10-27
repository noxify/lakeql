import { writeFileSync } from "node:fs"
import path from "node:path"

import { installPackage } from "@antfu/install-pkg"

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
    cwd: targetDir,
    packageManager,
    silent: true,
  })
}
