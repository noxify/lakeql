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

  // pnpm reads project settings from pnpm-workspace.yaml (since pnpm 11,
  // .npmrc is auth/registry only). allowBuilds lets esbuild's postinstall
  // run; the preview-only blockExoticSubdeps opt-out is appended below.
  if (packageManager === "pnpm") {
    writeFileSync(
      path.resolve(targetDir, "pnpm-workspace.yaml"),
      pnpmWorkspaceYaml(packageManager)
    )
  }

  await installPackage([], {
    cwd: targetDir,
    packageManager,
    silent: true,
  })
}

/**
 * Whether the generated project opts out of pnpm's exotic subdependency
 * block.
 *
 * This is true only for a pnpm `pkg.pr.new` preview build, where the project
 * pins its `@lakeql/*` dependencies to `pkg.pr.new` URLs and those packages
 * depend on further url-resolved `@lakeql/*` packages. Callers use it to
 * surface a notice so the relaxed setting is not applied silently.
 *
 * @param packageManager - The chosen package manager (npm, pnpm, yarn).
 */
export function allowsExoticSubdeps(packageManager: string): boolean {
  const { previewSha } = getBuildEnv()
  return packageManager === "pnpm" && Boolean(previewSha)
}

/**
 * Builds the generated project's `pnpm-workspace.yaml`.
 *
 * Always enables the esbuild build script. During a `pkg.pr.new` preview
 * build it also sets `blockExoticSubdeps: false`: the project's `@lakeql/*`
 * deps resolve via `pkg.pr.new` URLs and depend on further url-resolved
 * `@lakeql/*` packages, which pnpm v10+ rejects by default
 * (`ERR_PNPM_EXOTIC_SUBDEP`). Writing it to the workspace file — rather than
 * passing a one-off install flag — means every later pnpm command in the
 * project (including the `verifyDepsBeforeRun` install that `pnpm run` performs)
 * also resolves the tree. A released build resolves every dependency from npm
 * with no exotic subdependencies, so the setting is only written in preview
 * mode.
 *
 * @param packageManager - The chosen package manager (npm, pnpm, yarn).
 */
function pnpmWorkspaceYaml(packageManager: string): string {
  const base = "allowBuilds:\n  esbuild: true\n"
  if (allowsExoticSubdeps(packageManager)) {
    return `${base}blockExoticSubdeps: false\n`
  }

  return base
}
