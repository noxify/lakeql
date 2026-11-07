import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const FORBIDDEN_PACKAGES = [
  "@lakeql/query-builder",
  "@lakeql/sql-read-strategy",
  "@lakeql/adapter-trino",
  "@lakeql/adapter-fabric",
]

const SRC_DIR = path.join(import.meta.dirname, "..", "src")

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

  it("no source file contains module augmentation", () => {
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
    const pkgJsonPath = path.join(import.meta.dirname, "..", "package.json")
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"))
    const violations: { section: string; pkg: string }[] = []

    for (const section of ["dependencies", "peerDependencies"] as const) {
      const deps = pkgJson[section]
      if (!deps) {
        continue
      }
      for (const dep of Object.keys(deps)) {
        const forbidden = FORBIDDEN_PACKAGES.find(
          (pkg) => dep === pkg || dep.startsWith(`${pkg}/`)
        )
        if (forbidden) {
          violations.push({ section, pkg: dep })
        }
      }
    }

    const summary = violations
      .map((v) => `  ${v.section}: "${v.pkg}"`)
      .join("\n")
    expect(
      violations,
      `Found ${violations.length} forbidden dependency(ies):\n${summary}`
    ).toHaveLength(0)
  })
})
