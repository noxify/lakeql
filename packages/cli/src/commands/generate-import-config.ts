import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { success, warning } from "@lakeql/logger/console"
import { confirm } from "@topcli/prompts"
import { loadConfig as c12LoadConfig } from "c12"
import { globby } from "globby"

import { resolveSourcePath } from "@/config"
import { CliError, createAbortError } from "@/errors"
import { getInvocationCwd } from "@/path-utils"

import { buildGenerateImportConfigCommandStructure } from "../metadata/generate-import-config-metadata"

interface GeneratedEntry {
  dataSource: string
  catalog: string
  schema: string
  tables: string[]
}

/**
 * The authoritative per-endpoint metadata exported as `sourceConfig` from each
 * generated `config.ts`. Mirrors the shape produced by
 * `@lakeql/file-generator`'s `generateConfig`. The `adapter` field is read for
 * shape fidelity but is neither validated nor copied into the emitted import
 * config — it is derivable from the data source, so it is intentionally
 * redundant there.
 */
interface SourceConfig {
  dataSource: string
  adapter: string
  catalog: string
  schema: string
  tableName: string
}

const REQUIRED_SOURCE_CONFIG_FIELDS = [
  "dataSource",
  "catalog",
  "schema",
  "tableName",
] as const

function readSourceConfig(loaded: unknown, configFile: string): SourceConfig {
  // c12 may surface the module's named exports directly on `config` or wrap
  // them under `default`. Handle both shapes.
  const record =
    loaded && typeof loaded === "object"
      ? (loaded as Record<string, unknown>)
      : {}
  const container =
    "sourceConfig" in record
      ? record
      : record.default && typeof record.default === "object"
        ? (record.default as Record<string, unknown>)
        : record

  const sourceConfig = container.sourceConfig as unknown

  if (!sourceConfig || typeof sourceConfig !== "object") {
    throw new CliError(
      `Generated config "${configFile}" is missing a "sourceConfig" export.`,
      {
        code: "GENERATE_IMPORT_CONFIG_INVALID_SOURCE",
        hint: "Re-run `lakeql-cli pull` to regenerate the endpoint config.",
        exitCode: 1,
      }
    )
  }

  const candidate = sourceConfig as Record<string, unknown>
  const missing = REQUIRED_SOURCE_CONFIG_FIELDS.filter(
    (field) => typeof candidate[field] !== "string" || candidate[field] === ""
  )

  if (missing.length > 0) {
    throw new CliError(
      `Generated config "${configFile}" has an invalid "sourceConfig".`,
      {
        code: "GENERATE_IMPORT_CONFIG_INVALID_SOURCE",
        details: [`Missing or empty field(s): ${missing.join(", ")}`],
        hint: "Re-run `lakeql-cli pull` to regenerate the endpoint config.",
        exitCode: 1,
      }
    )
  }

  return {
    dataSource: candidate.dataSource as string,
    adapter: (candidate.adapter as string) ?? "",
    catalog: candidate.catalog as string,
    schema: candidate.schema as string,
    tableName: candidate.tableName as string,
  }
}

async function loadSourceConfig(configFilePath: string): Promise<SourceConfig> {
  // Strip the extension — c12 expects `configFile` without one and evaluates
  // the TypeScript source via jiti rather than parsing it textually.
  const parsed = path.parse(configFilePath)
  const configFile = path.join(parsed.dir, parsed.name)

  const { config } = await c12LoadConfig<Record<string, unknown>>({
    name: "lakeql-endpoint",
    cwd: parsed.dir,
    configFile,
    packageJson: false,
    globalRc: false,
    rcFile: false,
    dotenv: false,
  })

  return readSourceConfig(config, configFilePath)
}

async function scanGeneratedSchemas(
  sourcePath: string
): Promise<GeneratedEntry[]> {
  const generatedDir = path.join(sourcePath, "schemas", "generated")

  if (!existsSync(generatedDir)) {
    throw new CliError(`No generated schemas found at "${generatedDir}".`, {
      code: "GENERATE_IMPORT_CONFIG_NO_SCHEMAS",
      hint: "Run `lakeql-cli pull` first to generate schemas.",
      exitCode: 1,
    })
  }

  const configFiles = await globby("schemas/generated/**/config.ts", {
    cwd: sourcePath,
    onlyFiles: true,
    absolute: true,
  })

  if (configFiles.length === 0) {
    throw new CliError(
      `No generated endpoint configs found under "${generatedDir}".`,
      {
        code: "GENERATE_IMPORT_CONFIG_EMPTY",
        hint: "Run `lakeql-cli pull` first to generate schemas.",
        exitCode: 1,
      }
    )
  }

  const sourceConfigs = await Promise.all(
    configFiles.map((configFile) => loadSourceConfig(configFile))
  )

  // Group by the composite key (dataSource, catalog, schema), collecting each
  // table into `tables`. This reads the authoritative values from each
  // endpoint's config.ts rather than interpreting directory names, so it does
  // not shift levels the way the directory-walking scan did.
  const grouped = new Map<string, GeneratedEntry>()

  for (const sc of sourceConfigs) {
    const key = `${sc.dataSource}\u0000${sc.catalog}\u0000${sc.schema}`
    const existing = grouped.get(key)
    if (existing) {
      if (!existing.tables.includes(sc.tableName)) {
        existing.tables.push(sc.tableName)
      }
    } else {
      grouped.set(key, {
        dataSource: sc.dataSource,
        catalog: sc.catalog,
        schema: sc.schema,
        tables: [sc.tableName],
      })
    }
  }

  // Stable, deterministic ordering of entries and tables.
  const entries = [...grouped.values()].map((entry) => ({
    ...entry,
    tables: [...entry.tables].toSorted(),
  }))

  entries.sort((a, b) => {
    if (a.dataSource !== b.dataSource) {
      return a.dataSource < b.dataSource ? -1 : 1
    }
    if (a.catalog !== b.catalog) {
      return a.catalog < b.catalog ? -1 : 1
    }
    return a.schema < b.schema ? -1 : a.schema > b.schema ? 1 : 0
  })

  return entries
}

function renderConfig(entries: GeneratedEntry[]): string {
  const lines: string[] = [
    "/** @type {import('@lakeql/cli').BulkPullConfig} */",
    "export default [",
  ]

  for (const entry of entries) {
    const tablesJson = JSON.stringify(entry.tables, null, 2)
      .split("\n")
      .map((l, i) => (i === 0 ? l : `    ${l}`))
      .join("\n")

    lines.push(
      `  {`,
      `    dataSource: ${JSON.stringify(entry.dataSource)},`,
      `    catalog: ${JSON.stringify(entry.catalog)},`,
      `    schema: ${JSON.stringify(entry.schema)},`,
      `    tables: ${tablesJson},`,
      `  },`
    )
  }

  lines.push("]", "")
  return lines.join("\n")
}

export default function GenerateImportConfigCommand() {
  const command = buildGenerateImportConfigCommandStructure()

  command.action(async (props) => {
    const { sourcePath: cliSourcePath, output, force } = props

    const cliOverride =
      // oxlint-disable-next-line no-restricted-properties
      cliSourcePath === (process.env.INIT_CWD ?? process.cwd())
        ? undefined
        : cliSourcePath

    const resolvedSourcePath = await resolveSourcePath(cliOverride)
    const entries = await scanGeneratedSchemas(resolvedSourcePath)

    const configContent = renderConfig(entries)

    // Resolve output path
    const outputPath = path.isAbsolute(output)
      ? output
      : path.resolve(getInvocationCwd(), output)

    // Check for existing file / ask for confirmation unless --force
    if (!force && existsSync(outputPath)) {
      // oxlint-disable-next-line no-console
      console.log(warning(`File "${outputPath}" already exists.`))
      const shouldOverwrite = await confirm(`Overwrite "${outputPath}"?`)
      if (!shouldOverwrite) {
        throw createAbortError(
          "Aborted: import config generation was not confirmed."
        )
      }
    }

    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, configContent, "utf-8")

    // oxlint-disable-next-line no-console
    console.log(success(`Written to "${outputPath}".`))
  })

  return command
}
