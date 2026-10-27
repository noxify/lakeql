/**
 * `applyFeature` — the idempotent twin of {@link materializeFiles} for an
 * **existing** project.
 *
 * Where `materializeFiles` regenerates owned files from scratch on a clean
 * slate, `applyFeature` consumes a feature's {@link FeatureResult} and applies
 * it on top of files the user already authored. It splits its work by risk:
 *
 * - **Auto-applied** (safe, additive, idempotent): add a `package.json`
 *   dependency only when absent, append missing keys to `.env.example`, and
 *   write a file only when it does not already exist.
 * - **Guidance-only** (user-authored TypeScript the tool will not edit in v1):
 *   the env schema (`src/env.ts`) and config wiring (`lakeql.config.ts`) are
 *   never written — the exact lines to add are collected as guidance.
 *
 * Re-running is a no-op: auto-applied steps detect existing content and
 * guidance-only steps never touch those files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import type { FeatureResult } from "./features/types"
import type {
  AddDataSourceOp,
  AddDepsOp,
  AddEnvSchemaOp,
  AddEnvVarsOp,
  AddFileOp,
  Op,
} from "./ops"
import type { TsValue } from "./ts-serializer"
import { serializeTs } from "./ts-serializer"

/**
 * Error thrown when the target directory is not a valid project (e.g. it has
 * no `package.json`). The CLI boundary maps this to its own `CliError`, so this
 * package stays free of a reverse dependency on `@lakeql/cli`.
 */
export class InvalidProjectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidProjectError"
  }
}

/** Whether to write changes to disk or only preview them. */
export type ApplyMode = "write" | "dry-run"

/** Options controlling how a feature is applied. */
export interface ApplyFeatureOptions {
  /** Absolute project root the feature is applied against. */
  projectDir: string
  /**
   * Preview changes without touching disk when set to `"dry-run"`.
   * Defaults to `"write"`.
   */
  mode?: ApplyMode
}

/**
 * The outcome of applying a feature into an existing project.
 */
export interface ApplyFeatureResult {
  /** One line per auto-applied (or would-be-applied) change. */
  applied: string[]
  /**
   * Guidance lines for the user to apply by hand: the two user-authored
   * TypeScript files plus any out-of-repo follow-up steps.
   */
  guidance: string[]
}

/** Renders the same `.env.example` section header as the greenfield builder. */
function envSection(title: string): string {
  return [
    "# ─────────────────────────────────────────",
    `# ${title}`,
    "# ─────────────────────────────────────────",
  ].join("\n")
}

/** Parse the keys already declared in an `.env.example` file. */
function existingEnvKeys(content: string): Set<string> {
  const keys = new Set<string>()
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith("#")) {
      continue
    }
    const eq = line.indexOf("=")
    if (eq > 0) {
      keys.add(line.slice(0, eq).trim())
    }
  }
  return keys
}

/** Apply an `addDeps` op: add only absent entries, write back sorted. */
function applyAddDeps(
  op: AddDepsOp,
  projectDir: string,
  mode: ApplyMode,
  applied: string[]
): void {
  const pkgPath = path.join(projectDir, "package.json")
  if (!existsSync(pkgPath)) {
    throw new InvalidProjectError(
      `No package.json found in ${projectDir}; not a valid project.`
    )
  }

  const field = op.dev ? "devDependencies" : "dependencies"
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<
    string,
    unknown
  >
  const current: Record<string, string> = {
    ...(pkg[field] as Record<string, string> | undefined),
  }

  const added: string[] = []
  for (const [name, version] of Object.entries(op.deps)) {
    if (current[name] === undefined) {
      current[name] = version
      added.push(`${name}@${version}`)
    }
  }

  if (added.length === 0) {
    return
  }

  const sorted = Object.fromEntries(
    Object.entries(current).toSorted(([a], [b]) => a.localeCompare(b))
  )

  for (const dep of added) {
    applied.push(
      `${mode === "dry-run" ? "would add" : "added"} ${field} ${dep}`
    )
  }

  if (mode === "dry-run") {
    return
  }

  pkg[field] = sorted
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8")
}

/**
 * Apply an `addEnvVars` op: append the missing keys to `.env.example` under the
 * op's group heading, creating the file when absent.
 */
function applyAddEnvVars(
  op: AddEnvVarsOp,
  projectDir: string,
  mode: ApplyMode,
  applied: string[]
): void {
  const envPath = path.join(projectDir, ".env.example")
  const exists = existsSync(envPath)
  const content = exists ? readFileSync(envPath, "utf-8") : ""
  const present = existingEnvKeys(content)
  const group = op.group ?? "General"

  const missing = Object.entries(op.vars)
    .filter(([key]) => !present.has(key))
    .toSorted(([a], [b]) => a.localeCompare(b))

  if (missing.length === 0) {
    return
  }

  const block = [
    envSection(group),
    ...missing.map(([key, value]) => `${key}=${value}`),
  ].join("\n")

  for (const [key] of missing) {
    applied.push(
      `${mode === "dry-run" ? "would append" : "appended"} env ${key} to .env.example`
    )
  }

  if (mode === "dry-run") {
    return
  }

  if (exists) {
    const separator = content.endsWith("\n") ? "\n" : "\n\n"
    writeFileSync(envPath, `${content}${separator}${block}\n`, "utf-8")
  } else {
    writeFileSync(envPath, `${block}\n`, "utf-8")
  }
}

/** Apply an `addFile` op: write only when the file is absent. */
function applyAddFile(
  op: AddFileOp,
  projectDir: string,
  mode: ApplyMode,
  applied: string[]
): void {
  const filePath = path.join(projectDir, op.path)
  if (existsSync(filePath)) {
    applied.push(`skipped file ${op.path} (already exists)`)
    return
  }

  applied.push(`${mode === "dry-run" ? "would create" : "created"} ${op.path}`)

  if (mode === "dry-run") {
    return
  }

  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, op.content, "utf-8")
}

/** Collect env-schema guidance for the user-authored `src/env.ts`. */
function collectEnvSchemaGuidance(
  op: AddEnvSchemaOp,
  guidance: string[]
): void {
  const entries = Object.entries(op.schema).toSorted(([a], [b]) =>
    a.localeCompare(b)
  )
  if (entries.length === 0) {
    return
  }

  const codeLines = entries.map(([key, schema]) => `    ${key}: ${schema},`)
  guidance.push(
    [
      "Add these entries to the `server: { … }` object in src/env.ts:",
      ...codeLines,
    ].join("\n")
  )
}

/** Collect config-wiring guidance for the user-authored `lakeql.config.ts`. */
function collectDataSourceGuidance(
  op: AddDataSourceOp,
  guidance: string[]
): void {
  const value: Record<string, TsValue> = { adapter: op.adapter, ...op.config }
  const key = /^[A-Za-z_$][\w$]*$/u.test(op.name)
    ? op.name
    : JSON.stringify(op.name)
  guidance.push(
    `Wire the "${op.name}" data source into dataSources in lakeql.config.ts:\n    ${key}: ${serializeTs(value, 2)},`
  )
}

/**
 * Apply a feature's contributions into an existing project.
 *
 * Auto-applied ops (`addDeps`, `addEnvVars`, `addFile`) are written when
 * missing; the env schema (`addEnvSchema`) and config wiring
 * (`addDataSource`/`addAdapter`) are returned as guidance per the v1
 * guidance-only strategy. The feature's `nextSteps` are appended to the
 * guidance.
 *
 * @param result - The feature's contributions (ops + follow-up steps).
 * @param options - Target project directory and write mode.
 * @returns The applied actions and the guidance lines.
 * @throws {InvalidProjectError} When an `addDeps` op targets a directory with
 * no `package.json`.
 */
export function applyFeature(
  result: FeatureResult,
  options: ApplyFeatureOptions
): ApplyFeatureResult {
  const mode: ApplyMode = options.mode ?? "write"
  const { projectDir } = options
  const applied: string[] = []
  const guidance: string[] = []

  for (const op of result.ops as Op[]) {
    switch (op.type) {
      case "addDeps": {
        applyAddDeps(op, projectDir, mode, applied)
        break
      }
      case "addEnvVars": {
        applyAddEnvVars(op, projectDir, mode, applied)
        break
      }
      case "addFile": {
        applyAddFile(op, projectDir, mode, applied)
        break
      }
      case "addEnvSchema": {
        collectEnvSchemaGuidance(op, guidance)
        break
      }
      case "addDataSource": {
        collectDataSourceGuidance(op, guidance)
        break
      }
      case "addAdapter": {
        guidance.push(
          `Import and register the "${op.definitionExport}" adapter from "${op.package}" in lakeql.config.ts.`
        )
        break
      }
      default: {
        break
      }
    }
  }

  guidance.push(...result.nextSteps)

  return { applied, guidance }
}
