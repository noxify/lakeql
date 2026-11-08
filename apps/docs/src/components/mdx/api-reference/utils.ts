import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { ComponentPropsWithoutRef } from "react"

export type AnchorProps = ComponentPropsWithoutRef<"a">

/**
 * Absolute path to the monorepo's `packages/` directory, resolved from this
 * module's own on-disk location instead of `process.cwd()`.
 *
 * Why not `process.cwd()`: the previous implementation did
 * `path.resolve(process.cwd(), "../../packages", ...)`, which only produced the
 * right path when the working directory happened to be `apps/docs` (the Next
 * build and `pnpm --filter docs test`). Running `pnpm test` from the repo root
 * — which is exactly what CI does — made `../../packages` point two levels above
 * the repo, so ts-morph threw `FileNotFoundError` and the api-reference helpers
 * silently fell back to their "could not be generated" output.
 *
 * Why `fileURLToPath(import.meta.url)` + a walk-up works in both Next and
 * Vitest: these api-reference helpers only ever run in Node (Next's
 * `output: "export"` renders the server components at build time in Node, and
 * Vitest runs in Node). In both environments this module is evaluated from its
 * real file on disk, so `import.meta.url` is this source file's own `file://`
 * URL. Walking up from that location to the workspace root (the directory
 * holding both `pnpm-workspace.yaml` and `packages/`) yields the same absolute
 * `packages/` directory regardless of the current working directory. We search
 * for the workspace-root markers rather than counting fixed `../` segments so
 * the lookup does not silently break if this file is moved to a different depth.
 *
 * We use `fileURLToPath(import.meta.url)` and NOT `import.meta.dirname`: Next's
 * webpack server bundle provides `import.meta.url` but leaves `import.meta.dirname`
 * `undefined`, which made the Next build throw "path argument must be of type
 * string". `import.meta.url` is stable in both the Next build and Vitest, so the
 * oxlint `prefer-import-meta-properties` hint is intentionally disabled below.
 */
const PACKAGES_DIR = resolvePackagesDir()

function resolvePackagesDir(): string {
  // oxlint-disable-next-line unicorn/prefer-import-meta-properties -- import.meta.dirname is undefined in Next's webpack server bundle; see comment above.
  let current = path.dirname(fileURLToPath(import.meta.url))

  // Walk up until we find the workspace root: the directory that contains both
  // the pnpm workspace manifest and a `packages/` directory.
  while (true) {
    const packagesDir = path.join(current, "packages")

    if (
      fs.existsSync(path.join(current, "pnpm-workspace.yaml")) &&
      fs.existsSync(packagesDir)
    ) {
      return packagesDir
    }

    const parent = path.dirname(current)

    if (parent === current) {
      // Reached the filesystem root without finding the workspace. Fall back to
      // the legacy cwd-relative behavior so a misconfigured layout fails the
      // same way it did before rather than throwing here.
      return path.resolve(process.cwd(), "../../packages")
    }

    current = parent
  }
}

/** Resolve a package-relative file path to an absolute path on disk. */
export function resolvePackagePath(file: string): string {
  return path.join(PACKAGES_DIR, `${file}.ts`)
}

export function kindToLabel(kind: string): string {
  return kind.replaceAll(
    /(?<lower>[a-z])(?<upper>[A-Z])/gu,
    "$<lower> $<upper>"
  )
}

/**
 * Extracts @see tags into link objects.
 * Supports:
 * - `@see https://example.com`
 * - `@see {@link https://example.com | Label}`
 */
export function extractSeeLinks(
  tags?: { name: string; text?: string }[]
): { url: string; label: string }[] | undefined {
  if (!tags) {
    return undefined
  }

  const links = tags
    .filter((t) => t.name === "see" && t.text)
    .map((t) => {
      // oxlint-disable-next-line typescript/no-non-null-assertion
      const text = t.text!.trim()

      // {@link url | label} format
      const linkMatch =
        /^\{@link\s+(?<url>https?:\/\/\S+?)(?:\s*\|\s*(?<label>[^}]+))?\}$/u.exec(
          text
        )

      if (linkMatch?.groups?.url) {
        return {
          url: linkMatch.groups.url,
          label: linkMatch.groups.label?.trim() || linkMatch.groups.url,
        }
      }

      // Plain URL
      const urlMatch = /^(?<url>https?:\/\/\S+)$/u.exec(text)

      if (urlMatch?.groups?.url) {
        const urlObj = new URL(urlMatch.groups.url)
        const lastSegment = urlObj.pathname.split("/").findLast(Boolean)
        return {
          url: urlMatch.groups.url,
          label: lastSegment?.replace(/\.html$/u, "") || urlMatch.groups.url,
        }
      }

      return null
    })
    .filter((l): l is { url: string; label: string } => l !== null)

  return links.length > 0 ? links : undefined
}
