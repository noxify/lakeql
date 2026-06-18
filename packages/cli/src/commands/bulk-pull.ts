import path from "node:path"

import { info } from "@lakeql/logger/console"
import { TrinoClient } from "@lakeql/trino-client"
import { loadConfig as c12LoadConfig } from "c12"
import { Listr } from "listr2"
import { ZodError } from "zod/v4"

import type { BulkPullConfig } from "@/bulk-pull-config"
import { validateBulkPullConfig } from "@/bulk-pull-config"
import { runConfigRegistryGeneration } from "@/commands/create-registry"
import { resolveSourcePath } from "@/config"
import { getEnv } from "@/env"
import { CliError, createTrinoConnectionError } from "@/errors"
import { getInvocationCwd } from "@/path-utils"

import { executePull } from "./pull-action"

export interface BulkPullOptions {
  /** Path to the bulk config file (e.g. import.config.mjs). */
  configPath?: string
  /** CLI --catalog override. */
  catalog?: string
  /** CLI --source-path override. */
  sourcePathOverride?: string
  /** Skip config registry generation. */
  skipRegistry: boolean
}

/**
 * Loads the bulk pull config using c12.
 * Supports .ts, .mjs, .js, .json formats.
 * If a custom configPath is provided, it's used as the configFile option.
 * Exported for testing purposes.
 */
export async function loadBulkConfig(
  configPath?: string
): Promise<BulkPullConfig> {
  const cwd = getInvocationCwd()

  // If user provides a custom path, extract name from it for c12
  let configFile: string | undefined
  if (configPath) {
    // Strip extension and resolve relative to cwd
    const resolved = path.isAbsolute(configPath)
      ? configPath
      : path.resolve(cwd, configPath)
    const parsed = path.parse(resolved)
    // c12 expects configFile without extension
    configFile = path.join(parsed.dir, parsed.name)
  }

  const { config } = await c12LoadConfig<{ default: BulkPullConfig }>({
    name: "import",
    cwd,
    configFile,
    packageJson: false,
    globalRc: false,
    rcFile: false,
    dotenv: false,
  })

  // c12 resolves the default export into the config object.
  // Handle both shapes: direct array or wrapped in default.
  const resolved = config as unknown
  if (Array.isArray(resolved)) {
    return validateBulkPullConfig(resolved)
  }

  // If c12 wraps it, extract the default
  if (
    resolved &&
    typeof resolved === "object" &&
    "default" in resolved &&
    Array.isArray((resolved as { default: unknown }).default)
  ) {
    return validateBulkPullConfig((resolved as { default: unknown }).default)
  }

  return validateBulkPullConfig([])
}

/**
 * Executes the bulk pull — loads the config, then processes all entries
 * concurrently using listr2 for structured terminal output.
 */
export async function executeBulkPull(options: BulkPullOptions): Promise<void> {
  const {
    configPath,
    catalog: cliCatalog,
    sourcePathOverride,
    skipRegistry,
  } = options

  const env = getEnv()
  const resolvedTargetPath = await resolveSourcePath(sourcePathOverride)
  let config: BulkPullConfig
  try {
    config = await loadBulkConfig(configPath)
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => {
        const issuePath = issue.path.length > 0 ? issue.path.join(".") : "root"
        return `  - ${issuePath}: ${issue.message}`
      })

      throw new CliError("Invalid bulk pull config.", {
        code: "BULK_CONFIG_INVALID",
        details,
        hint: "Ensure each entry defines a schema and at least one non-empty list: tables or views.",
        cause: error,
      })
    }

    throw error
  }

  if (config.length === 0) {
    // oxlint-disable-next-line no-console
    console.log(info("No entries found in bulk config."))
    return
  }

  const tasks = new Listr(
    [
      {
        title: "Pull data",
        task: (_, task) =>
          task.newListr(
            config.map((entry) => {
              const catalog = cliCatalog ?? entry.catalog ?? env.HIVE_CATALOG
              const tableCount = entry.tables?.length ?? 0
              const viewCount = entry.views?.length ?? 0
              const itemCount = tableCount + viewCount

              return {
                title: `${catalog}/${entry.schema} — ${itemCount} item(s)`,
                task: async (_ctx, subtask) => {
                  const trinoClient = new TrinoClient({
                    auth: {
                      password: env.HIVE_PASSWORD,
                      type: "basic",
                      username: env.HIVE_USERNAME,
                    },
                    catalog,
                    host: env.HIVE_HOST,
                    port: env.HIVE_PORT,
                  })

                  if (entry.tables && entry.tables.length > 0) {
                    subtask.output = `Pulling ${entry.tables.length} table(s)...`
                    try {
                      await executePull({
                        trinoClient,
                        catalog,
                        schema: entry.schema,
                        tables: entry.tables,
                        resolvedTargetPath,
                        skipRegistry: true,
                        sourcePathOverride,
                      })
                    } catch (error) {
                      throw createTrinoConnectionError(
                        "pull tables",
                        `bulk pull (catalog=${catalog}, schema=${entry.schema}, tables=${entry.tables.join(",")})`,
                        error
                      )
                    }
                  }

                  if (entry.views && entry.views.length > 0) {
                    subtask.output = `Pulling ${entry.views.length} view(s)...`
                    try {
                      await executePull({
                        trinoClient,
                        catalog,
                        schema: entry.schema,
                        tables: entry.views,
                        resolvedTargetPath,
                        skipRegistry: true,
                        sourcePathOverride,
                      })
                    } catch (error) {
                      throw createTrinoConnectionError(
                        "pull views",
                        `bulk pull (catalog=${catalog}, schema=${entry.schema}, views=${entry.views.join(",")})`,
                        error
                      )
                    }
                  }

                  subtask.title = `${catalog}/${entry.schema} — ${itemCount} item(s) pulled`
                },
              }
            }),
            { concurrent: true, exitOnError: false }
          ),
      },
      {
        title: "Create registry",
        enabled: !skipRegistry,
        task: async () => {
          await runConfigRegistryGeneration(sourcePathOverride)
        },
      },
    ],
    { concurrent: false, exitOnError: true }
  )

  await tasks.run()
}
