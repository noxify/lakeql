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
import { DEFAULT_PULL_CONCURRENCY } from "@/options"
import { getInvocationCwd } from "@/path-utils"

import { executePull } from "./pull-action"

const LARGE_BULK_ENTRY_THRESHOLD = 10
const MAX_ACTIVE_PREVIEW = 5

function getRootCauseMessage(error: unknown): string | undefined {
  let current: unknown = error
  let lastMessage: string | undefined

  for (let i = 0; i < 10; i += 1) {
    if (current instanceof Error) {
      if (current.message) {
        lastMessage = current.message
      }
      current = (current as { cause?: unknown }).cause
    } else if (typeof current === "object" && current !== null) {
      const msg = (current as { message?: unknown }).message
      if (typeof msg === "string") {
        lastMessage = msg
      }
      current = (current as { cause?: unknown }).cause
    } else {
      break
    }
  }

  return lastMessage
}

function createConcurrencyLimiter(maxConcurrent: number) {
  let activeCount = 0
  const queue: (() => void)[] = []

  const release = () => {
    activeCount -= 1
    const next = queue.shift()
    next?.()
  }

  return async function runWithLimit<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    if (activeCount >= maxConcurrent) {
      // oxlint-disable-next-line promise/avoid-new
      await new Promise<void>((resolve) => {
        queue.push(resolve)
      })
    }

    activeCount += 1

    try {
      return await operation()
    } finally {
      release()
    }
  }
}

export interface BulkPullOptions {
  /** Path to the bulk config file (e.g. import.config.mjs). */
  configPath?: string
  /** CLI --catalog override. */
  catalog?: string
  /** Maximum number of concurrent pull operations. */
  concurrency?: number
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
    concurrency = DEFAULT_PULL_CONCURRENCY,
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

  const runWithPullSlot = createConcurrencyLimiter(concurrency)

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
              const useCompactProgress = itemCount > LARGE_BULK_ENTRY_THRESHOLD

              return {
                title: `${catalog}/${entry.schema} — ${itemCount} item(s)`,
                task: async (_ctx, subtask) => {
                  let completed = 0
                  const activeItems = new Set<string>()
                  const parallelism = Math.min(concurrency, itemCount)

                  const updateCompactOutput = () => {
                    const activeList = [...activeItems]
                      .slice(0, MAX_ACTIVE_PREVIEW)
                      .map((name) => `  - ${catalog}.${entry.schema}.${name}`)
                      .join("\n")

                    const extraActive =
                      activeItems.size > MAX_ACTIVE_PREVIEW
                        ? `\n  ... +${activeItems.size - MAX_ACTIVE_PREVIEW} more active`
                        : ""

                    subtask.output = `Completed ${completed}/${itemCount} | Active ${activeItems.size}/${parallelism}${activeList ? `\n${activeList}${extraActive}` : ""}`
                  }

                  if (useCompactProgress) {
                    updateCompactOutput()
                  }

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

                  const runSingleItemPull = async (
                    itemName: string,
                    itemKind: "tables" | "views"
                  ) => {
                    try {
                      await runWithPullSlot(() =>
                        executePull({
                          trinoClient,
                          catalog,
                          schema: entry.schema,
                          tables: [itemName],
                          resolvedTargetPath,
                          skipRegistry: true,
                          sourcePathOverride,
                        })
                      )
                    } catch (error) {
                      throw createTrinoConnectionError(
                        itemKind === "tables" ? "pull tables" : "pull views",
                        `bulk pull (catalog=${catalog}, schema=${entry.schema}, ${itemKind}=${itemName})`,
                        error
                      )
                    }
                  }

                  if (useCompactProgress) {
                    const queue = [
                      ...(entry.tables?.map((itemName) => ({
                        itemKind: "tables" as const,
                        itemName,
                      })) ?? []),
                      ...(entry.views?.map((itemName) => ({
                        itemKind: "views" as const,
                        itemName,
                      })) ?? []),
                    ]

                    const failedItems: {
                      itemName: string
                      itemKind: "tables" | "views"
                      error: Error
                    }[] = []

                    const worker = async () => {
                      // oxlint-disable-next-line no-unreachable-loop
                      while (queue.length > 0) {
                        const nextItem = queue.shift()
                        if (!nextItem) {
                          return
                        }

                        activeItems.add(nextItem.itemName)
                        updateCompactOutput()

                        try {
                          // oxlint-disable-next-line no-await-in-loop
                          await runSingleItemPull(
                            nextItem.itemName,
                            nextItem.itemKind
                          )
                          completed += 1
                        } catch (error) {
                          failedItems.push({
                            itemName: nextItem.itemName,
                            itemKind: nextItem.itemKind,
                            error:
                              error instanceof Error
                                ? error
                                : new Error(String(error)),
                          })
                        } finally {
                          activeItems.delete(nextItem.itemName)
                          updateCompactOutput()
                        }
                      }
                    }

                    await Promise.all(
                      Array.from({ length: parallelism }, () => worker())
                    )

                    if (failedItems.length > 0) {
                      const failureDetails = failedItems.map(
                        ({ itemName, itemKind, error }) => {
                          const rootMessage =
                            getRootCauseMessage(error) || error.message
                          return `${itemName} (${itemKind}): ${rootMessage}`
                        }
                      )

                      const firstError = failedItems[0]?.error
                      if (!firstError) {
                        throw new Error("Failed to collect error information")
                      }

                      throw new CliError(
                        `${catalog}/${entry.schema} — ${completed}/${itemCount} item(s) pulled.\nFailed items:\n  - ${failureDetails.join("\n  - ")}`,
                        {
                          code: "BULK_PULL_PARTIAL_FAILURE",
                          cause: firstError,
                        }
                      )
                    }

                    subtask.output = `Completed ${completed}/${itemCount}`
                    subtask.title = `${catalog}/${entry.schema} — ${itemCount} item(s) pulled`
                    return
                  }

                  if (entry.tables && entry.tables.length > 0) {
                    const { tables } = entry
                    subtask.output = `Pulling ${tables.length} table(s)...`
                    try {
                      await runWithPullSlot(() =>
                        executePull({
                          trinoClient,
                          catalog,
                          schema: entry.schema,
                          tables,
                          resolvedTargetPath,
                          skipRegistry: true,
                          sourcePathOverride,
                        })
                      )
                    } catch (error) {
                      throw createTrinoConnectionError(
                        "pull tables",
                        `bulk pull (catalog=${catalog}, schema=${entry.schema}, tables=${tables.join(",")})`,
                        error
                      )
                    }
                  }

                  if (entry.views && entry.views.length > 0) {
                    const { views } = entry
                    subtask.output = `Pulling ${views.length} view(s)...`
                    try {
                      await runWithPullSlot(() =>
                        executePull({
                          trinoClient,
                          catalog,
                          schema: entry.schema,
                          tables: views,
                          resolvedTargetPath,
                          skipRegistry: true,
                          sourcePathOverride,
                        })
                      )
                    } catch (error) {
                      throw createTrinoConnectionError(
                        "pull views",
                        `bulk pull (catalog=${catalog}, schema=${entry.schema}, views=${views.join(",")})`,
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
