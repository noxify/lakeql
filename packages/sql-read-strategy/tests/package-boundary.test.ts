import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/** Concrete adapter packages that must never be imported. */
const FORBIDDEN_PACKAGES = ["@lakeql/adapter-trino", "@lakeql/adapter-fabric"]

/**
 * Legacy Trino-specific symbols that new Foundation source must not import
 * from `@lakeql/query-builder` or `@lakeql/response-transformer`.
 */
const LEGACY_SYMBOLS = new Set([
  "formatQuery",
  "convertTrinoResponse",
  "transform",
])

/**
 * Runtime dependency allowlist (beyond devDependencies).
 * Any `dependencies` or `peerDependencies` entry outside this set is a violation.
 */
const ALLOWED_RUNTIME_DEPS = new Set([
  "@lakeql/datasource",
  "@lakeql/helpers",
  "@lakeql/query-builder",
  "@lakeql/response-transformer",
])

/**
 * Known adapter name strings that should never appear in conditional logic
 * (switch cases, if-checks, or pattern-matching) in new source files.
 */
const ADAPTER_NAME_LITERALS = ["trino", "fabric"]

const SRC_DIR = path.join(import.meta.dirname, "..", "src")
const PKG_JSON_PATH = path.join(import.meta.dirname, "..", "package.json")

function collectTsFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full))
    } else if (entry.endsWith(".ts") || entry.endsWith(".mts")) {
      files.push(full)
    }
  }
  return files
}

function extractImports(content: string): string[] {
  const imports: string[] = []

  // Match static import statements: import ... from "package"
  const staticImportRe =
    /(?:import|export)\s+.*?from\s+["'](?<specifier>[^"']+)["']/gu
  let match: RegExpExecArray | null
  while ((match = staticImportRe.exec(content)) !== null) {
    const specifier = match.groups?.specifier
    if (specifier) {
      imports.push(specifier)
    }
  }

  // Match side-effect imports: import "package"
  const sideEffectRe = /import\s+["'](?<specifier>[^"']+)["']/gu
  while ((match = sideEffectRe.exec(content)) !== null) {
    const specifier = match.groups?.specifier
    if (specifier) {
      imports.push(specifier)
    }
  }

  // Match dynamic imports: import("package") or require("package")
  const dynamicRe =
    /(?:import|require)\s*\(\s*["'](?<specifier>[^"']+)["']\s*\)/gu
  while ((match = dynamicRe.exec(content)) !== null) {
    const specifier = match.groups?.specifier
    if (specifier) {
      imports.push(specifier)
    }
  }

  return imports
}

/**
 * Extract named imports from an import statement.
 * Matches `import { A, B } from "pkg"` and `import { type A, B } from "pkg"`.
 */
function extractNamedImports(
  content: string,
  pkg: string
): { file: string; symbols: string[] }[] {
  const results: { file: string; symbols: string[] }[] = []

  // Match import { ... } from "pkg" or import { ... } from "pkg/..."
  const re = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*["'](?:${escapeRegex(pkg)}(?:/[^"']*)?)["']`,
    "gu"
  )
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    const [, clause] = match
    if (clause) {
      const symbols = clause
        .split(",")
        .map((s) =>
          s
            .trim()
            .replace(/^type\s+/u, "")
            .replace(/\s+as\s+.*/u, "")
        )
        .filter(Boolean)
      results.push({ file: pkg, symbols })
    }
  }

  return results
}

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

function isForbidden(importPath: string): string | undefined {
  return FORBIDDEN_PACKAGES.find(
    (pkg) => importPath === pkg || importPath.startsWith(`${pkg}/`)
  )
}

describe("package boundary", () => {
  const sourceFiles = collectTsFiles(SRC_DIR)

  it("source directory contains at least one TypeScript file", () => {
    expect(sourceFiles.length).toBeGreaterThan(0)
  })

  it("no source file imports a forbidden package", () => {
    const violations: { file: string; pkg: string; specifier: string }[] = []

    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf-8")
      const imports = extractImports(content)

      for (const specifier of imports) {
        const forbidden = isForbidden(specifier)
        if (forbidden) {
          violations.push({
            file: path.relative(SRC_DIR, file),
            pkg: forbidden,
            specifier,
          })
        }
      }
    }

    const summary = violations
      .map((v) => `  ${v.file} imports "${v.specifier}" (forbidden: ${v.pkg})`)
      .join("\n")
    expect(
      violations,
      `Found ${violations.length} forbidden import(s):\n${summary}`
    ).toHaveLength(0)
  })

  it("no source file imports legacy Trino-specific symbols", () => {
    const violations: {
      file: string
      pkg: string
      symbol: string
    }[] = []

    const legacySourcePackages = [
      "@lakeql/query-builder",
      "@lakeql/response-transformer",
    ]

    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf-8")

      for (const pkg of legacySourcePackages) {
        const namedImports = extractNamedImports(content, pkg)
        for (const { symbols } of namedImports) {
          for (const sym of symbols) {
            if (LEGACY_SYMBOLS.has(sym)) {
              violations.push({
                file: path.relative(SRC_DIR, file),
                pkg,
                symbol: sym,
              })
            }
          }
        }
      }
    }

    const summary = violations
      .map(
        (v) => `  ${v.file} imports legacy symbol "${v.symbol}" from "${v.pkg}"`
      )
      .join("\n")
    expect(
      violations,
      `Found ${violations.length} legacy symbol import(s):\n${summary}`
    ).toHaveLength(0)
  })

  it("no source file contains module augmentation (declare module)", () => {
    const violations: { file: string; line: number; text: string }[] = []
    const declareModuleRe = /declare\s+module\s+["']/gu

    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf-8")
      const lines = content.split("\n")

      for (const [index, line] of lines.entries()) {
        if (declareModuleRe.test(line)) {
          violations.push({
            file: path.relative(SRC_DIR, file),
            line: index + 1,
            text: line.trim(),
          })
        }
        declareModuleRe.lastIndex = 0
      }
    }

    const summary = violations
      .map((v) => `  ${v.file}:${v.line} — ${v.text}`)
      .join("\n")
    expect(
      violations,
      `Found ${violations.length} module augmentation(s):\n${summary}`
    ).toHaveLength(0)
  })

  it("package.json does not declare forbidden runtime or peer dependencies", () => {
    const pkgJson = JSON.parse(readFileSync(PKG_JSON_PATH, "utf-8"))
    const violations: { field: string; pkg: string }[] = []

    for (const field of ["dependencies", "peerDependencies"] as const) {
      const deps = pkgJson[field]
      if (!deps) {
        continue
      }

      for (const dep of Object.keys(deps)) {
        // Allow non-@lakeql deps (e.g. peer deps on node builtins) and allowlisted @lakeql deps
        if (dep.startsWith("@lakeql/") && !ALLOWED_RUNTIME_DEPS.has(dep)) {
          violations.push({ field, pkg: dep })
        }
        // Concrete adapter packages are always forbidden
        if (isForbidden(dep)) {
          violations.push({ field, pkg: dep })
        }
      }
    }

    const summary = violations.map((v) => `  ${v.field}: "${v.pkg}"`).join("\n")
    expect(
      violations,
      `Found ${violations.length} forbidden dependency(ies):\n${summary}`
    ).toHaveLength(0)
  })

  it("no source file contains adapter-name conditional logic", () => {
    const violations: {
      file: string
      line: number
      text: string
      adapterName: string
    }[] = []

    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf-8")
      const lines = content.split("\n")

      for (const [index, line] of lines.entries()) {
        // Skip comment lines
        const trimmed = line.trim()
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
          continue
        }

        for (const name of ADAPTER_NAME_LITERALS) {
          // Check for string literals containing adapter names in conditional contexts:
          // case "trino", === "trino", !== "trino", == "trino", != "trino"
          const conditionalRe = new RegExp(
            `(?:case\\s+|[!=]==?\\s*)["']${escapeRegex(name)}["']`,
            "u"
          )
          if (conditionalRe.test(line)) {
            violations.push({
              file: path.relative(SRC_DIR, file),
              line: index + 1,
              text: trimmed,
              adapterName: name,
            })
          }
        }
      }
    }

    const summary = violations
      .map(
        (v) =>
          `  ${v.file}:${v.line} — adapter-name check for "${v.adapterName}": ${v.text}`
      )
      .join("\n")
    expect(
      violations,
      `Found ${violations.length} adapter-name conditional(s):\n${summary}`
    ).toHaveLength(0)
  })
})
