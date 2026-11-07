import path from "node:path"

import { info } from "@lakeql/logger/console"
import { loadConfig as c12LoadConfig } from "c12"
import { Listr } from "listr2"
import { ZodError } from "zod/v4"

import type { BulkPullConfig, BulkPullEntry } from "@/bulk-pull-config"
import { validateBulkPullConfig } from "@/bulk-pull-config"
import { runConfigRegistryGeneration } from "@/commands/create-registry"
import { loadConfig, resolveSourcePath } from "@/config"
import { CliError, createDataSourceConnectionError } from "@/errors"
import { listrRendererOptions } from "@/listr-renderer"
import { DEFAULT_PULL_CONCURRENCY } from "@/options"
import { getInvocationCwd } from "@/path-utils"
import { assertValidNamePrefix } from "@/pipeline/derive-names"
import { resolveCatalog } from "@/resolve-catalog"
import type { ResolvedDataSource } from "@/resolve-datasource"
import { resolveDataSource } from "@/resolve-datasource"

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
  /** CLI --source flag for data source selection. */
  sourceFlag?: string
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
 * A bulk pull entry paired with the data source name it resolves to. The
 * effective data source is the entry's explicit `dataSource` or, in a
 * single-source project (or when `--source` pins one), the sole/pinned source.
 */
interface ResolvedEntry {
  entry: BulkPullEntry
  dataSourceName: string
}

/**
 * Determines each entry's effective data source and applies the maintainer
 * rule: a single-source project (or a `--source` filter) may omit
 * `dataSource`; a multi-source project requires it per entry.
 *
 * @throws {CliError} When an entry names an unknown data source, or when it
 * omits `dataSource` in a multi-source project with no `--source` filter.
 */
function resolveEntryDataSources(
  config: BulkPullConfig,
  configuredSourceNames: string[],
  sourceFlag: string | undefined
): ResolvedEntry[] {
  const isSingleSource = configuredSourceNames.length === 1
  const [soleSource] = configuredSourceNames

  return config.map((entry) => {
    if (entry.dataSource) {
      if (!configuredSourceNames.includes(entry.dataSource)) {
        throw new CliError(
          `Bulk entry (catalog=${entry.catalog ?? "<resolved>"}, schema=${entry.schema}) references unknown data source "${entry.dataSource}".`,
          {
            code: "BULK_DATASOURCE_NOT_FOUND",
            hint: `Available data sources: ${configuredSourceNames.join(", ")}.`,
          }
        )
      }
      return { entry, dataSourceName: entry.dataSource }
    }

    // No explicit dataSource on the entry.
    if (sourceFlag) {
      return { entry, dataSourceName: sourceFlag }
    }

    if (isSingleSource && soleSource) {
      return { entry, dataSourceName: soleSource }
    }

    throw new CliError(
      `Bulk entry (catalog=${entry.catalog ?? "<resolved>"}, schema=${entry.schema}) is missing "dataSource".`,
      {
        code: "BULK_DATASOURCE_REQUIRED",
        hint: `Multiple data sources are configured (${configuredSourceNames.join(", ")}). Set "dataSource" on each entry, or pass --source to pull a single source.`,
      }
    )
  })
}

/**
 * Executes the bulk pull — loads the config, then processes all entries
 * concurrently using listr2 for structured terminal output.
 *
 * Multi-source: without `--source`, every entry is resolved against its own
 * `dataSource`; with `--source <value>`, entries are filtered to that source
 * (plus `dataSource`-less entries in a single-source project). Each distinct
 * data source is resolved once, cached, and closed at the end — even on
 * failure.
 */
export async function executeBulkPull(options: BulkPullOptions): Promise<void> {
  const {
    configPath,
    catalog: cliCatalog,
    concurrency = DEFAULT_PULL_CONCURRENCY,
    sourcePathOverride,
    skipRegistry,
    sourceFlag,
  } = options

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

  // Determine which data sources the project configures so we can validate the
  // per-entry dataSource rule and (with --source) filter entries.
  const project = await loadConfig()
  const configuredSourceNames = Object.keys(project.config.dataSources)

  // Resolve each entry's effective data source up front (fail-fast on an
  // unknown or ambiguous source, before any network I/O).
  const resolvedEntries = resolveEntryDataSources(
    config,
    configuredSourceNames,
    sourceFlag
  )

  // --source is a FILTER: keep only entries belonging to the pinned source.
  const filteredEntries = sourceFlag
    ? resolvedEntries.filter((re) => re.dataSourceName === sourceFlag)
    : resolvedEntries

  if (filteredEntries.length === 0) {
    // oxlint-disable-next-line no-console
    console.log(info("No entries found in bulk config."))
    return
  }

  // Lazily resolve each distinct data source exactly once and cache the
  // instance so every entry for that source shares a connection.
  const sourceCache = new Map<
    string,
    {
      resolved: ResolvedDataSource
      resolvedCatalog: string
    }
  >()

  const getSource = async (name: string) => {
    const cached = sourceCache.get(name)
    if (cached) {
      return cached
    }

    const resolved = await resolveDataSource(name)

    // Validate the per-data-source prefix the moment the source is first
    // resolved — before any pull work or network I/O for it — so an invalid
    // prefix fails fast with the clear INVALID_NAME_PREFIX CliError instead of
    // being masked per item by createDataSourceConnectionError inside the pull
    // loop. Uses the same validator deriveNames applies at generate time.
    assertValidNamePrefix(resolved.config.namePrefix, resolved.name)

    const resolvedCatalog = await resolveCatalog({
      dataSource: resolved.instance,
      catalogFlag: cliCatalog,
      connectionCatalog: (resolved.config.connection as { catalog?: string })
        ?.catalog,
    })

    const entry = { resolved, resolvedCatalog }
    sourceCache.set(name, entry)
    return entry
  }

  // Pre-resolve every distinct source now so prefix validation and catalog
  // resolution fail fast (matching the previous single-source behaviour), and
  // so the finally block can close exactly the instances we opened.
  const distinctSourceNames = [
    ...new Set(filteredEntries.map((re) => re.dataSourceName)),
  ]

  try {
    for (const name of distinctSourceNames) {
      // oxlint-disable-next-line no-await-in-loop
      await getSource(name)
    }

    const runWithPullSlot = createConcurrencyLimiter(concurrency)

    const tasks = new Listr(
      [
        {
          title: "Pull data",
          task: (_, task) =>
            task.newListr(
              filteredEntries.map(({ entry, dataSourceName }) => {
                // The source was pre-resolved above, so this is always cached.
                const source = sourceCache.get(dataSourceName)
                if (!source) {
                  throw new CliError(
                    `Data source "${dataSourceName}" was not resolved.`,
                    { code: "BULK_DATASOURCE_NOT_RESOLVED" }
                  )
                }
                const { resolved, resolvedCatalog } = source
                const dataSource = resolved.instance
                const { namePrefix } = resolved.config

                const catalog = entry.catalog ?? resolvedCatalog
                const tableCount = entry.tables?.length ?? 0
                const viewCount = entry.views?.length ?? 0
                const itemCount = tableCount + viewCount
                const useCompactProgress =
                  itemCount > LARGE_BULK_ENTRY_THRESHOLD

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

                    const runSingleItemPull = async (
                      itemName: string,
                      itemKind: "tables" | "views"
                    ) => {
                      try {
                        await runWithPullSlot(() =>
                          executePull({
                            dataSource,
                            dataSourceName,
                            catalog,
                            schema: entry.schema,
                            tables: [itemName],
                            resolvedTargetPath,
                            skipRegistry: true,
                            sourcePathOverride,
                            namePrefix,
                          })
                        )
                      } catch (error) {
                        throw createDataSourceConnectionError(
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
                            dataSource,
                            dataSourceName,
                            catalog,
                            schema: entry.schema,
                            tables,
                            resolvedTargetPath,
                            skipRegistry: true,
                            sourcePathOverride,
                            namePrefix,
                          })
                        )
                      } catch (error) {
                        throw createDataSourceConnectionError(
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
                            dataSource,
                            dataSourceName,
                            catalog,
                            schema: entry.schema,
                            tables: views,
                            resolvedTargetPath,
                            skipRegistry: true,
                            sourcePathOverride,
                            namePrefix,
                          })
                        )
                      } catch (error) {
                        throw createDataSourceConnectionError(
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
      { concurrent: false, exitOnError: true, ...listrRendererOptions() }
    )

    await tasks.run()
  } finally {
    // Close every opened source, even on failure. allSettled so one source's
    // close rejection does not prevent the others from closing.
    await Promise.allSettled(
      [...sourceCache.values()].map(({ resolved }) => resolved.instance.close())
    )
  }
}
