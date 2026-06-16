import path from "node:path"
import { pathToFileURL } from "node:url"

import { TrinoClient } from "@lakeql/trino-client"
import { Listr } from "listr2"

import type { BulkPullConfig } from "@/bulk-pull-config"
import { runConfigRegistryGeneration } from "@/commands/config-registry"
import { resolveSourcePath } from "@/config"
import { getEnv } from "@/env"
import { getInvocationCwd } from "@/path-utils"

import { executePull } from "./pull-action"

export interface BulkPullOptions {
  /** Path to the bulk config file (e.g. import.config.mjs). */
  configPath: string
  /** CLI --catalog override. */
  catalog?: string
  /** CLI --source-path override. */
  sourcePathOverride?: string
  /** Skip config registry generation. */
  skipRegistry: boolean
}

/**
 * Loads the bulk config from the given .mjs file via dynamic import.
 */
async function loadBulkConfig(configPath: string): Promise<BulkPullConfig> {
  const resolved = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(getInvocationCwd(), configPath)

  const fileUrl = pathToFileURL(resolved).href
  const mod = await import(fileUrl)

  return mod.default as BulkPullConfig
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
  const resolvedTargetPath = resolveSourcePath(sourcePathOverride)
  const config = await loadBulkConfig(configPath)

  if (config.length === 0) {
    // oxlint-disable-next-line no-console
    console.log("No entries found in bulk config.")
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
                    await executePull({
                      trinoClient,
                      catalog,
                      schema: entry.schema,
                      tables: entry.tables,
                      resolvedTargetPath,
                      skipRegistry: true,
                      sourcePathOverride,
                    })
                  }

                  if (entry.views && entry.views.length > 0) {
                    subtask.output = `Pulling ${entry.views.length} view(s)...`
                    await executePull({
                      trinoClient,
                      catalog,
                      schema: entry.schema,
                      tables: entry.views,
                      resolvedTargetPath,
                      skipRegistry: true,
                      sourcePathOverride,
                    })
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
