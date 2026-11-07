import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { getBuildEnv } from "./build-env"

interface NpmPackageData {
  version: string
}

const { previewSha } = getBuildEnv()

/**
 * Returns the `https://pkg.pr.new` preview install URL for a `@lakeql/*`
 * package at the build-time preview SHA.
 */
function previewVersion(packageName: string): string {
  return `https://pkg.pr.new/noxify/lakeql/${packageName}@${previewSha}`
}

async function getLatestVersion(packageName: string): Promise<string> {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${packageName}/latest`
    )
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = (await response.json()) as NpmPackageData
    return `^${data.version}`
  } catch {
    return "*"
  }
}

export async function updatePackageJson(
  targetDir: string,
  projectName: string,
  planDeps: Record<string, string>,
  planDevDeps: Record<string, string>,
  keepWorkspaceVersions = false
): Promise<void> {
  const packageJsonPath = path.resolve(targetDir, "package.json")
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    private?: boolean
    [key: string]: unknown
  }

  // Filter out adapter packages not in the plan
  const selectedPkgs = new Set(Object.keys(planDeps))
  const filteredDeps = Object.fromEntries(
    Object.entries(packageJson.dependencies ?? {}).filter(
      ([key]) => !key.startsWith("@lakeql/adapter-") || selectedPkgs.has(key)
    )
  )

  // Merge plan deps
  for (const [name, range] of Object.entries(planDeps)) {
    filteredDeps[name] = range
  }

  const mergedDevDeps = {
    ...packageJson.devDependencies,
    ...planDevDeps,
  }

  // In local/dev mode, keep `workspace:*` so the generated project resolves
  // against the local monorepo packages. Otherwise resolve to npm versions.
  if (!keepWorkspaceVersions) {
    const workspaceDeps = [
      ...Object.entries(filteredDeps)
        .filter(([, v]) => v === "workspace:*")
        .map(([name]) => ({ name, target: "dependencies" as const })),
      ...Object.entries(mergedDevDeps)
        .filter(([, v]) => v === "workspace:*")
        .map(([name]) => ({ name, target: "devDependencies" as const })),
    ]

    // During a pkg.pr.new preview build (previewSha non-empty), resolve
    // `@lakeql/*` deps to this same build's preview URL so the scaffolded
    // project is self-consistent with the feature branch under test.
    // Non-`@lakeql/*` deps always resolve via npm `latest`, and the whole
    // branch falls back to today's npm-only behavior when previewSha is
    // empty (the released build).
    const versions = await Promise.all(
      workspaceDeps.map(({ name }) =>
        previewSha && name.startsWith("@lakeql/")
          ? Promise.resolve(previewVersion(name))
          : getLatestVersion(name)
      )
    )

    for (const [i, { name, target }] of workspaceDeps.entries()) {
      const version = versions[i]
      if (version) {
        if (target === "dependencies") {
          filteredDeps[name] = version
        } else {
          mergedDevDeps[name] = version
        }
      }
    }
  }

  const updatedPackageJson = {
    ...packageJson,
    dependencies: sortByKey(filteredDeps),
    devDependencies: sortByKey(mergedDevDeps),
    name: projectName,
  }
  delete updatedPackageJson.private

  writeFileSync(packageJsonPath, JSON.stringify(updatedPackageJson, null, 2))
}

/**
 * Returns a new record with keys sorted alphabetically. Generated
 * `package.json` dependency maps are built by merging template and plan
 * entries in insertion order; sorting keeps the output stable and satisfies
 * monorepo consistency checks (e.g. sherif's alphabetical-dependencies rule)
 * when a project is scaffolded inside the workspace in local mode.
 */
function sortByKey(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b))
  )
}
