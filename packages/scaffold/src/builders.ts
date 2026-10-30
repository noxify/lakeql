/**
 * File content builders that generate source strings from a Plan.
 */

import type { Plan } from "./ops"
import type { TsValue } from "./ts-serializer"
import { serializeTs } from "./ts-serializer"

/** Renders a `# ===`-style section header for the `.env.example`. */
function envSection(title: string): string {
  return [
    "# ─────────────────────────────────────────",
    `# ${title}`,
    "# ─────────────────────────────────────────",
  ].join("\n")
}

/**
 * Generate `.env.example` content from the plan's env groups.
 *
 * Each group (contributed by a feature, e.g. auth or an adapter) becomes a
 * labelled section, emitted in the order the groups were added (auth first,
 * then data sources in selection order), followed by the always-present
 * GraphQL API section. A short intro comment points to the docs and repository.
 */
export function generateEnvExample(plan: Plan): string {
  const intro = [
    "# Environment variables for your LakeQL app.",
    "# Copy this file to .env and fill in the values.",
    "#",
    "# Docs:  https://lakeql.dev/docs",
    "# Repo:  https://github.com/noxify/lakeql",
  ].join("\n")

  // Each block is a self-contained string; blocks are joined with a blank
  // line so sections are always visually separated.
  const blocks: string[] = [intro]

  for (const { group, vars } of plan.envGroups) {
    const lines = Object.entries(vars)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
    if (lines.length > 0) {
      blocks.push([envSection(group), ...lines].join("\n"))
    }
  }

  // Static API vars (always present).
  blocks.push(
    [envSection("GraphQL API"), `API_PORT=4000`, `API_LOGGER="warn"`].join("\n")
  )

  return `${blocks.join("\n\n")}\n`
}

/**
 * Generate src/env.ts content from plan's envSchema.
 */
export function generateEnvTs(plan: Plan): string {
  const baseEntries: Record<string, string> = {
    API_LOGGER:
      'zodEnum(["debug", "info", "warn", "error", "silent"]).default("warn")',
    API_PORT: "coerce.number().default(4000)",
    NODE_ENV:
      'zodEnum(["development", "production", "test"]).default("development")',
  }

  const allEntries = { ...baseEntries, ...plan.envSchema }

  // Each server entry sits two levels deep (inside `server: {` inside
  // `createEnv({`), i.e. 4 spaces.
  const serverLines = Object.entries(allEntries)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([key, schema]) => `    ${key}: ${schema},`)

  // Build line-by-line with explicit indentation (no dedent, which mis-handles
  // interpolated multi-line blocks).
  const lines = [
    `/* eslint-disable no-restricted-properties */`,
    `import { createEnv } from "@t3-oss/env-core"`,
    `import { coerce, string, enum as zodEnum } from "zod"`,
    ``,
    `export const env = createEnv({`,
    `  runtimeEnv: process.env,`,
    `  server: {`,
    ...serverLines,
    `  },`,
    `  skipValidation:`,
    `    !!process.env.CI ||`,
    `    process.env.npm_lifecycle_event === "lint" ||`,
    `    process.env.npm_lifecycle_event === "test",`,
    `})`,
    ``,
  ]

  return lines.join("\n")
}

/**
 * Generate lakeql.config.ts content from plan's dataSources.
 */
export function generateLakeqlConfig(plan: Plan): string {
  // Each data source is serialized at indent depth 2 (inside `dataSources: {`).
  const dsEntries = Object.entries(plan.dataSources)
    .map(([name, ds]) => {
      const value: Record<string, TsValue> = {
        adapter: ds.adapter,
        ...ds.config,
      }
      const key = /^[A-Za-z_$][\w$]*$/u.test(name) ? name : JSON.stringify(name)
      return `    ${key}: ${serializeTs(value, 2)},`
    })
    .join("\n")

  // Adapter imports, sorted by package for deterministic output.
  const adapterImports = plan.adapters
    .toSorted((a, b) => a.package.localeCompare(b.package))
    .map(
      ({ definitionExport, package: pkg }) =>
        `import { ${definitionExport} } from "${pkg}"`
    )

  // `adapters: [...]` referencing the imported definitions, inline and
  // unquoted (they are identifiers, not string values).
  const adaptersArray = `[${plan.adapters
    .map((a) => a.definitionExport)
    .join(", ")}]`

  // Build line-by-line with explicit indentation (no dedent, which mis-handles
  // interpolated multi-line blocks).
  const lines = [
    `import { defineConfig } from "@lakeql/config"`,
    ...adapterImports,
    ``,
    `import { env } from "./src/env"`,
    ``,
    `export default defineConfig({`,
    `  sourcePath: "src",`,
    `  adapters: ${adaptersArray},`,
    `  dataSources: {`,
    dsEntries,
    `  },`,
    `})`,
    ``,
  ]

  return lines.join("\n")
}
