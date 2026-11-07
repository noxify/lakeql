import { existsSync } from "node:fs"
import { cp } from "node:fs/promises"
import path from "node:path"

import { downloadTemplate as download } from "giget"

import { getBuildEnv } from "./build-env"

const TEMPLATE_PATH = "templates/app"
const TEMPLATE_REPO = "github:noxify/lakeql"

const { templateRef } = getBuildEnv()

/** Directory/file names never copied from a local template. */
const LOCAL_COPY_EXCLUDES = new Set([
  "node_modules",
  "dist",
  ".turbo",
  ".cache",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
])

/**
 * Downloads (remote) or copies (local) the starter template into `targetDir`.
 *
 * @param targetDir - Destination project directory.
 * @param localTemplateDir - When set, copy this local directory instead of
 *   fetching from GitHub. Build artifacts and lock files are skipped.
 */
export async function downloadTemplate(
  targetDir: string,
  localTemplateDir?: string
): Promise<void> {
  if (localTemplateDir !== undefined) {
    await copyLocalTemplate(localTemplateDir, targetDir)
    return
  }

  const source = templateRef
    ? `${TEMPLATE_REPO}/${TEMPLATE_PATH}#${templateRef}`
    : `${TEMPLATE_REPO}/${TEMPLATE_PATH}`

  await download(source, {
    dir: targetDir,
    offline: false,
    // Bypass giget's on-disk cache when a ref is pinned so a branch ref
    // always pulls its latest commit rather than a stale cached tarball.
    // The default (release) path keeps giget's normal caching behavior.
    force: templateRef !== "",
  })
}

/**
 * Copies a local template directory into the target, excluding build artifacts
 * and lock files.
 *
 * @throws {Error} When the source dir does not exist or has no `package.json`.
 */
async function copyLocalTemplate(
  sourceDir: string,
  targetDir: string
): Promise<void> {
  if (!existsSync(sourceDir)) {
    throw new Error(`Local template directory not found: ${sourceDir}`)
  }
  if (!existsSync(path.join(sourceDir, "package.json"))) {
    throw new Error(
      `Local template directory has no package.json: ${sourceDir}`
    )
  }

  await cp(sourceDir, targetDir, {
    recursive: true,
    filter: (src) => !LOCAL_COPY_EXCLUDES.has(path.basename(src)),
  })
}
