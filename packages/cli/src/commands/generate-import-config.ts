import { existsSync } from "node:fs"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { success, warning } from "@lakeql/logger/console"
import { confirm } from "@topcli/prompts"

import { resolveSourcePath } from "@/config"
import { CliError, createAbortError } from "@/errors"
import { getInvocationCwd } from "@/path-utils"

import { buildGenerateImportConfigCommandStructure } from "../metadata/generate-import-config-metadata"

interface GeneratedEntry {
  catalog: string
  schema: string
  tables: string[]
}

async function getSubdirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .toSorted()
  } catch {
    return []
  }
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

  const catalogs = await getSubdirs(generatedDir)
  if (catalogs.length === 0) {
    throw new CliError(`No catalogs found in "${generatedDir}".`, {
      code: "GENERATE_IMPORT_CONFIG_EMPTY",
      hint: "Run `lakeql-cli pull` first to generate schemas.",
      exitCode: 1,
    })
  }

  const entries = await Promise.all(
    catalogs.map(async (catalog) => {
      const catalogDir = path.join(generatedDir, catalog)
      const schemas = await getSubdirs(catalogDir)

      const schemaEntries = await Promise.all(
        schemas.map(async (schema) => {
          const schemaDir = path.join(catalogDir, schema)
          const tables = await getSubdirs(schemaDir)
          return tables.length > 0 ? { catalog, schema, tables } : null
        })
      )

      return schemaEntries.filter((e) => e !== null)
    })
  )

  return entries.flat()
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

    lines.push(`  {`)
    lines.push(`    catalog: ${JSON.stringify(entry.catalog)},`)
    lines.push(`    schema: ${JSON.stringify(entry.schema)},`)
    lines.push(`    tables: ${tablesJson},`)
    lines.push(`  },`)
  }

  lines.push("]")
  lines.push("")
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
