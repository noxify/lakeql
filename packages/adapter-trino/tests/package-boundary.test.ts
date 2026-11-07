/**
 * Package boundary tests for `@lakeql/adapter-trino`.
 *
 * Scans source files for forbidden imports, legacy symbols, module
 * augmentation, and validates that `package.json` dependencies match
 * the allowed list from the architecture spec.
 */

import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

// ── Helpers ──────────────────────────────────────────────────────────────────

const PKG_ROOT = path.resolve(import.meta.dirname, "..")
const SRC_DIR = path.join(PKG_ROOT, "src")

/**
 * Recursively collect all `.ts` files under a directory.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full))
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(full)
    }
  }
  return results
}

/** All TypeScript source files in `src/`. */
const sourceFiles = collectTsFiles(SRC_DIR)

/** Read and return the content of each source file as `[relativePath, content]` pairs. */
function readSourceFiles(): [string, string][] {
  return sourceFiles.map((file) => {
    const relative = file.slice(SRC_DIR.length + 1)
    const content = readFileSync(file, "utf-8")
    return [relative, content]
  })
}

const sourceContents = readSourceFiles()

// ── Forbidden package imports ────────────────────

describe("forbidden package imports", () => {
  const forbiddenPackages = [
    // must not import @lakeql/config
    "@lakeql/config",
    // must not import other adapter packages
    "@lakeql/adapter-fabric",
    // must not import application packages
    "@lakeql/api",
    "@lakeql/cli",
  ]

  const forbiddenCases = sourceContents.flatMap(([file, content]) =>
    forbiddenPackages.map((pkg) => ({ file, content, pkg }))
  )

  it.each(forbiddenCases)(
    '$file does not import "$pkg"',
    ({ content, pkg }) => {
      const importPattern = new RegExp(
        `(?:from\\s+|import\\s+|require\\s*\\()\\s*["']${pkg.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:[/"']|$)`,
        "u"
      )
      expect(content).not.toMatch(importPattern)
    }
  )

  // wildcard check for any @lakeql/adapter-* package
  it.each(sourceContents)(
    "%s does not import any @lakeql/adapter-* package",
    (_file, content) => {
      // Match any adapter package except adapter-trino itself
      const adapterPattern =
        /(?:from\s+|import\s+|require\s*\()\s*["']@lakeql\/adapter-(?!trino["'/])\w+/u
      expect(content).not.toMatch(adapterPattern)
    }
  )
})

// ── Legacy imports ──────────────────────────────────────────

describe("no legacy imports", () => {
  // legacy query-builder exports
  const legacyQueryBuilderSymbols = [
    "generateQuery",
    "formatQuery",
    "getSelectFields",
    "initDb",
  ]

  const legacyLibraries = ["sql-formatter", "graphql"]

  // legacy response-transformer exports
  const legacyResponseTransformerSymbols = [
    "convertTrinoResponse",
    "transformObject",
    "transformArray",
  ]

  const legacyPackages = ["@formkit/tempo"]

  const queryBuilderCases = sourceContents.flatMap(([file, content]) =>
    legacyQueryBuilderSymbols.map((symbol) => ({ file, content, symbol }))
  )

  it.each(queryBuilderCases)(
    '$file does not import legacy query-builder symbol "$symbol"',
    ({ content, symbol }) => {
      const pattern = new RegExp(`\\b${symbol}\\b`, "u")
      expect(content).not.toMatch(pattern)
    }
  )

  const legacyLibCases = sourceContents.flatMap(([file, content]) =>
    legacyLibraries.map((lib) => ({ file, content, lib }))
  )

  it.each(legacyLibCases)(
    '$file does not import legacy library "$lib"',
    ({ content, lib }) => {
      const pattern = new RegExp(
        `(?:from\\s+|import\\s+|require\\s*\\()\\s*["']${lib.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`,
        "u"
      )
      expect(content).not.toMatch(pattern)
    }
  )

  const rtSymbolCases = sourceContents.flatMap(([file, content]) =>
    legacyResponseTransformerSymbols.map((symbol) => ({
      file,
      content,
      symbol,
    }))
  )

  it.each(rtSymbolCases)(
    '$file does not import legacy response-transformer symbol "$symbol"',
    ({ content, symbol }) => {
      const pattern = new RegExp(`\\b${symbol}\\b`, "u")
      expect(content).not.toMatch(pattern)
    }
  )

  // Check for `transform` imported specifically from response-transformer
  it.each(sourceContents)(
    '%s does not import "transform" from @lakeql/response-transformer',
    (_file, content) => {
      const pattern =
        /import\s+\{[^}]*\btransform\b[^}]*\}\s+from\s+["']@lakeql\/response-transformer["']/u
      expect(content).not.toMatch(pattern)
    }
  )

  const legacyPkgCases = sourceContents.flatMap(([file, content]) =>
    legacyPackages.map((pkg) => ({ file, content, pkg }))
  )

  it.each(legacyPkgCases)(
    '$file does not import legacy package "$pkg"',
    ({ content, pkg }) => {
      const pattern = new RegExp(
        `(?:from\\s+|import\\s+|require\\s*\\()\\s*["']${pkg.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`,
        "u"
      )
      expect(content).not.toMatch(pattern)
    }
  )
})

// ── No declare module augmentation ───────────────────────────

describe("no declare module augmentation", () => {
  it.each(sourceContents)(
    '%s does not use "declare module"',
    (_file, content) => {
      const pattern = /declare\s+module\s+["']/u
      expect(content).not.toMatch(pattern)
    }
  )
})

// ── package.json dependencies ────────────────────────────────

describe("package.json dependencies match allowed list", () => {
  const pkgJson = JSON.parse(
    readFileSync(path.join(PKG_ROOT, "package.json"), "utf-8")
  ) as {
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }

  const allowedDependencies = new Set([
    "@lakeql/datasource",
    "@lakeql/parquet",
    "@lakeql/query-builder",
    "@lakeql/response-transformer",
    "@lakeql/schema-generator",
    "@lakeql/sql-read-strategy",
    "@lakeql/storage",
    "@lakeql/trino-client",
  ])

  const runtimeDeps = Object.keys(pkgJson.dependencies ?? {})
  const peerDeps = Object.keys(pkgJson.peerDependencies ?? {})
  const allDeclaredDeps = [...runtimeDeps, ...peerDeps]

  it("only allowed @lakeql packages are in dependencies or peerDependencies", () => {
    const lakeqlDeps = allDeclaredDeps.filter((dep) =>
      dep.startsWith("@lakeql/")
    )
    for (const dep of lakeqlDeps) {
      expect(allowedDependencies).toContain(dep)
    }
  })

  it("all allowed dependencies are declared", () => {
    for (const allowed of allowedDependencies) {
      expect(allDeclaredDeps).toContain(allowed)
    }
  })

  // Forbidden packages must not appear in dependencies or peerDependencies
  const forbiddenInManifest = [
    "@lakeql/config",
    "@lakeql/api",
    "@lakeql/cli",
    "@lakeql/adapter-fabric",
  ]

  it.each(forbiddenInManifest)(
    '"%s" is not in dependencies or peerDependencies',
    (pkg) => {
      expect(allDeclaredDeps).not.toContain(pkg)
    }
  )

  // No adapter-* packages (except adapter-trino itself, which is the package)
  it("no @lakeql/adapter-* packages in dependencies or peerDependencies", () => {
    const adapterDeps = allDeclaredDeps.filter((dep) =>
      dep.startsWith("@lakeql/adapter-")
    )
    expect(adapterDeps).toStrictEqual([])
  })
})
