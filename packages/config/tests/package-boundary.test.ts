import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const PKG_ROOT = path.resolve(import.meta.dirname, "..")
const SRC_DIR = path.join(PKG_ROOT, "src")
const TESTS_DIR = path.join(PKG_ROOT, "tests")
const PACKAGES_DIR = path.resolve(PKG_ROOT, "..")

/**
 * Collect all `.ts` files under a directory recursively.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...collectTsFiles(full))
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(full)
    }
  }
  return results
}

/**
 * Pattern matching concrete adapter packages: `@lakeql/adapter-*`.
 */
const CONCRETE_ADAPTER_PATTERN =
  /["']@lakeql\/adapter(?:s|-.+?)(?:\/[^"']*)?["']/u

/**
 * Extracts all import/export specifiers from a TypeScript source file.
 */
function extractImportSpecifiers(content: string): string[] {
  const specifiers: string[] = []
  // Match: from "..." or from '...'
  const fromPattern = /\bfrom\s+["'](?<specifier>[^"']+)["']/gu
  // Match: import("...") dynamic imports
  const dynamicPattern = /\bimport\s*\(\s*["'](?<specifier>[^"']+)["']\s*\)/gu

  for (const match of content.matchAll(fromPattern)) {
    const specifier = match.groups?.specifier
    if (specifier) {
      specifiers.push(specifier)
    }
  }
  for (const match of content.matchAll(dynamicPattern)) {
    const specifier = match.groups?.specifier
    if (specifier) {
      specifiers.push(specifier)
    }
  }
  return specifiers
}

/**
 * Forbidden import targets for all source modules:
 * concrete adapter packages must never be imported.
 */

/**
 * Registry-scope files: adapter-registry.ts and errors/**
 * These have the strictest boundary (no c12, no config loading modules).
 */
function isRegistryScopeFile(filePath: string): boolean {
  return (
    filePath.includes("adapter-registry") ||
    filePath.includes(`${path.sep}errors${path.sep}`)
  )
}

/** Loader modules are the only package-scope files allowed to import c12. */
function isLoaderModule(filePath: string): boolean {
  return path.basename(filePath) === "load-config.ts"
}

/**
 * Forbidden imports that apply only to registry-scope modules.
 * The package entry point and other package-scope modules are allowed
 * to re-export from local config loading modules.
 */
const REGISTRY_ONLY_FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /["'].*(?:config-load|load-config|loadConfig).*["']/u,
    label: "config loading module",
  },
  {
    pattern: /["'].*(?:auth-resolv|resolveAuth|auth-provider).*["']/u,
    label: "auth resolution module",
  },
  {
    pattern:
      /["'].*(?:runtime-lifecycle|createLakeQLRuntime|runtime-owner).*["']/u,
    label: "runtime lifecycle module",
  },
  {
    pattern:
      /["'].*(?:strategy-construct|createReadStrategy|createWriteStrategy).*["']/u,
    label: "strategy construction module",
  },
]

/**
 * Forbidden imports that apply to ALL source modules (including entry point).
 */
const UNIVERSAL_FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: CONCRETE_ADAPTER_PATTERN, label: "concrete adapter package" },
]

describe("Package boundary: @lakeql/config", () => {
  describe("implementation modules reject forbidden imports", () => {
    const srcFiles = collectTsFiles(SRC_DIR)

    it("contains at least one source file", () => {
      expect(srcFiles.length).toBeGreaterThan(0)
    })

    it.each(srcFiles.map((f) => [f.replace(`${PKG_ROOT}/`, ""), f]))(
      "%s has no forbidden imports",
      (_label, filePath) => {
        const content = readFileSync(filePath, "utf-8")

        // Determine which patterns to apply based on file scope
        const patterns: { pattern: RegExp; label: string }[] = [
          ...UNIVERSAL_FORBIDDEN_PATTERNS,
          ...(isRegistryScopeFile(filePath)
            ? REGISTRY_ONLY_FORBIDDEN_PATTERNS
            : []),
        ]

        for (const { pattern, label } of patterns) {
          const match = content.match(pattern)
          expect(
            match,
            `Found forbidden ${label} import: ${match?.[0]}`
          ).toBeNull()
        }
      }
    )
  })

  describe("dependency declarations", () => {
    it("@lakeql/config declares no concrete adapter packages in dependencies or devDependencies", () => {
      const pkg = JSON.parse(
        readFileSync(path.join(PKG_ROOT, "package.json"), "utf-8")
      )
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      }

      const concreteAdapterDeps = Object.keys(allDeps).filter((name) =>
        name.startsWith("@lakeql/adapter-")
      )

      expect(
        concreteAdapterDeps,
        `Found concrete adapter dependencies: ${concreteAdapterDeps.join(", ")}`
      ).toStrictEqual([])
    })

    it("concrete adapter packages do not declare @lakeql/config as a dependency", () => {
      const packageDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(PACKAGES_DIR, entry.name))

      const offendingPackages: string[] = []

      for (const dir of packageDirs) {
        const pkgJsonPath = path.join(dir, "package.json")
        try {
          statSync(pkgJsonPath)
        } catch {
          continue
        }
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"))

        const isConcreteAdapter = (pkg.name ?? "").startsWith(
          "@lakeql/adapter-"
        )
        if (!isConcreteAdapter) {
          continue
        }

        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        }

        if ("@lakeql/config" in deps) {
          offendingPackages.push(pkg.name as string)
        }
      }

      expect(
        offendingPackages,
        `Adapter packages must not depend on @lakeql/config. Offending packages: ${offendingPackages.join(", ")}`
      ).toStrictEqual([])
    })
  })

  describe("two-scope import enforcement", () => {
    /**
     * Registry-scope files: adapter-registry.ts and errors/**
     * Strictest boundary — only relative, @lakeql/datasource, node: built-ins.
     * c12 is NOT allowed.
     */
    const REGISTRY_ALLOWED_PATTERN =
      /^(?:\.|\.\.\/|@lakeql\/datasource(?:\/[^"']*)?$|node:)/u

    /**
     * Package-scope files: all other src/ modules.
     * Broader boundary — relative, @lakeql/datasource, node:, c12, and jiti.
     * c12 and jiti are allowed ONLY in designated loader modules
     * (load-config.ts); jiti backs c12's TypeScript config import.
     */
    const PACKAGE_ALLOWED_PATTERN =
      /^(?:\.|\.\.\/|@lakeql\/datasource(?:\/[^"']*)?$|node:|c12(?:$|\/[^"']*)|jiti(?:$|\/[^"']*))/u

    const allSrcFiles = collectTsFiles(SRC_DIR)

    const registryImplFiles = allSrcFiles.filter(
      (f) =>
        f.includes("adapter-registry") ||
        f.includes(`${path.sep}errors${path.sep}`)
    )

    const packageScopeFiles = allSrcFiles.filter(
      (f) =>
        !f.includes("adapter-registry") &&
        !f.includes(`${path.sep}errors${path.sep}`)
    )

    describe("registry scope (adapter-registry.ts, errors/**)", () => {
      it("identifies at least one registry implementation file", () => {
        expect(registryImplFiles.length).toBeGreaterThan(0)
      })

      it.each(registryImplFiles.map((f) => [f.replace(`${PKG_ROOT}/`, ""), f]))(
        "%s imports only from relative paths, @lakeql/datasource, and node: built-ins (no c12)",
        (_label, filePath) => {
          const content = readFileSync(filePath, "utf-8")
          const specifiers = extractImportSpecifiers(content)

          for (const specifier of specifiers) {
            expect(
              REGISTRY_ALLOWED_PATTERN.test(specifier),
              `Disallowed import "${specifier}" in ${_label}. Registry-scope allows only relative imports, @lakeql/datasource, and node: built-ins.`
            ).toBeTruthy()
          }
        }
      )
    })

    describe("package scope (non-registry src/ modules)", () => {
      it("identifies at least one package-scope file", () => {
        expect(packageScopeFiles.length).toBeGreaterThan(0)
      })

      it.each(packageScopeFiles.map((f) => [f.replace(`${PKG_ROOT}/`, ""), f]))(
        "%s imports only from allowlisted sources",
        (_label, filePath) => {
          const content = readFileSync(filePath, "utf-8")
          const specifiers = extractImportSpecifiers(content)

          for (const specifier of specifiers) {
            expect(
              PACKAGE_ALLOWED_PATTERN.test(specifier),
              `Disallowed import "${specifier}" in ${_label}. Package-scope allows relative imports, @lakeql/datasource, node: built-ins, and c12/jiti (loader modules only).`
            ).toBeTruthy()
          }
        }
      )

      it("only load-config.ts imports c12 — non-loader modules must not", () => {
        const nonLoaderFiles = packageScopeFiles.filter(
          (f) => !isLoaderModule(f)
        )

        const violations: string[] = []
        for (const filePath of nonLoaderFiles) {
          const content = readFileSync(filePath, "utf-8")
          const specifiers = extractImportSpecifiers(content)
          const c12Imports = specifiers.filter(
            (s) => s === "c12" || s.startsWith("c12/")
          )
          if (c12Imports.length > 0) {
            violations.push(
              `${filePath.replace(`${PKG_ROOT}/`, "")} imports c12: ${c12Imports.join(", ")}`
            )
          }
        }

        expect(
          violations,
          `Non-loader modules must not import c12:\n${violations.join("\n")}`
        ).toStrictEqual([])
      })

      it("only load-config.ts imports jiti — non-loader modules must not", () => {
        const nonLoaderFiles = packageScopeFiles.filter(
          (f) => !isLoaderModule(f)
        )

        const violations: string[] = []
        for (const filePath of nonLoaderFiles) {
          const content = readFileSync(filePath, "utf-8")
          const specifiers = extractImportSpecifiers(content)
          const jitiImports = specifiers.filter(
            (s) => s === "jiti" || s.startsWith("jiti/")
          )
          if (jitiImports.length > 0) {
            violations.push(
              `${filePath.replace(`${PKG_ROOT}/`, "")} imports jiti: ${jitiImports.join(", ")}`
            )
          }
        }

        expect(
          violations,
          `Non-loader modules must not import jiti:\n${violations.join("\n")}`
        ).toStrictEqual([])
      })
    })
  })

  describe("test files use only neutral contracts", () => {
    const BOUNDARY_TEST = path.join(TESTS_DIR, "package-boundary.test.ts")
    const testFiles = collectTsFiles(TESTS_DIR).filter(
      (f) => f !== BOUNDARY_TEST
    )

    it.each(
      testFiles.length > 0
        ? testFiles.map((f) => [f.replace(`${PKG_ROOT}/`, ""), f])
        : [["(no other test files yet — boundary holds vacuously)", ""]]
    )("%s does not import concrete adapter packages", (_label, filePath) => {
      if (!filePath) {
        return
      }
      const content = readFileSync(filePath, "utf-8")
      const match = content.match(CONCRETE_ADAPTER_PATTERN)
      expect(match, `Found concrete adapter import: ${match?.[0]}`).toBeNull()
    })
  })
})
