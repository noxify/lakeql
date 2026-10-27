// oxlint-disable no-await-in-loop
import { info, success } from "@lakeql/logger/console"
import { multiselect, select, validators } from "@topcli/prompts"
import { Listr } from "listr2"

import { runConfigRegistryGeneration } from "@/commands/create-registry"
import { resolveSourcePath } from "@/config"
import { CliError, createDataSourceConnectionError } from "@/errors"
import { listrRendererOptions } from "@/listr-renderer"
import { DEFAULT_PULL_CONCURRENCY } from "@/options"
import { resolveCatalog } from "@/resolve-catalog"
import { resolveDataSource } from "@/resolve-datasource"

import { buildPullCommandStructure } from "../metadata/pull-metadata"
import { executeBulkPull } from "./bulk-pull"
import { executePull } from "./pull-action"

const LARGE_PULL_THRESHOLD = 10
const MAX_ACTIVE_PREVIEW = 5

async function withDataSourceContext<T>(
  action: string,
  context: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw createDataSourceConnectionError(action, context, error)
  }
}

export default function PullCommand() {
  const pullCommand = buildPullCommandStructure()

  pullCommand.action(async (props) => {
    const {
      skipRegistry,
      sourcePath,
      bulk,
      bulkConfig,
      source: sourceFlag,
      concurrency = DEFAULT_PULL_CONCURRENCY,
    } = props

    // CLI --source-path overrides config; if it's the default (invocation cwd), use config
    const cliOverride =
      // oxlint-disable-next-line no-restricted-properties
      sourcePath === (process.env.INIT_CWD ?? process.cwd())
        ? undefined
        : sourcePath

    // Bulk mode: load config and process all entries in parallel
    if (bulk) {
      await executeBulkPull({
        configPath: bulkConfig,
        catalog: props.catalog,
        concurrency,
        sourcePathOverride: cliOverride,
        skipRegistry,
        sourceFlag,
      })
      return
    }

    // Interactive / single-schema mode
    const {
      name: dataSourceName,
      instance: dataSource,
      config: dsConfig,
    } = await resolveDataSource(sourceFlag)

    try {
      const catalog = await resolveCatalog({
        dataSource,
        catalogFlag: props.catalog,
        connectionCatalog: (dsConfig.connection as { catalog?: string })
          ?.catalog,
      })

      let { schema, table: tables, type } = props

      const resolvedTargetPath = await resolveSourcePath(cliOverride)

      if (!schema) {
        const remoteSchemas = await withDataSourceContext(
          "list schemas",
          `pull (catalog=${catalog})`,
          () => dataSource.schemas(catalog)
        )

        schema = await select(`Choose a schema from the ${catalog} catalog`, {
          autocomplete: true,
          choices: remoteSchemas,
        })
      }

      if (tables.length === 0) {
        type ??= await select(
          `What do you want to see from  ${catalog}/${schema}`,
          {
            choices: [
              { label: "Show tables", value: "tables" },
              { label: "Show views", value: "views" },
            ],
          }
        )
      }

      if (tables.length === 0) {
        type ??= "tables"
        let remoteTables: string[] = []
        remoteTables = await withDataSourceContext(
          type === "views" ? "list views" : "list tables",
          `pull (catalog=${catalog}, schema=${schema})`,
          () =>
            type === "views"
              ? dataSource.views(catalog, schema)
              : dataSource.tables(catalog, schema)
        )

        if (remoteTables.length === 0) {
          throw new CliError(
            `No ${type} found in schema '${catalog}.${schema}'.`,
            {
              code: "PULL_NO_RESULTS",
              hint: `Use a different schema or check permissions for '${catalog}.${schema}'.`,
              exitCode: 0,
            }
          )
        }

        tables = await multiselect(`Choose the ${type} to pull`, {
          autocomplete: true,
          choices: remoteTables,
          validators: [validators.required()],
        })
      }

      // oxlint-disable-next-line no-console
      console.log(
        info(
          `Pulling ${tables.length} item(s) from ${catalog}.${schema} into ${resolvedTargetPath}/schemas/generated/${dataSourceName}...`
        )
      )

      // Switch to compact live output for large pulls to avoid flooding terminal logs
      const useCompactLargePullMode = tables.length > LARGE_PULL_THRESHOLD

      const pullTasks = new Listr(
        [
          {
            title: `Pull ${tables.length} item(s)`,
            task: async (_, task) => {
              if (!useCompactLargePullMode) {
                return task.newListr(
                  tables.map((table) => ({
                    title: `${catalog}.${schema}.${table}`,
                    task: async () => {
                      await executePull({
                        dataSource,
                        dataSourceName,
                        catalog,
                        schema,
                        tables: [table],
                        resolvedTargetPath,
                        // Generate registry once at the end, not per endpoint.
                        skipRegistry: true,
                        sourcePathOverride: cliOverride,
                      })
                    },
                  })),
                  {
                    concurrent:
                      tables.length > 1
                        ? Math.min(concurrency, tables.length)
                        : false,
                    exitOnError: true,
                  }
                )
              }

              const queue = [...tables]
              const activeLoads = new Set<string>()
              let completed = 0
              const parallelism = Math.min(concurrency, tables.length)

              const updateOutput = () => {
                const activeList = [...activeLoads]
                  .slice(0, MAX_ACTIVE_PREVIEW)
                  .map((name) => `  - ${catalog}.${schema}.${name}`)
                  .join("\n")

                const extraActive =
                  activeLoads.size > MAX_ACTIVE_PREVIEW
                    ? `\n  ... +${activeLoads.size - MAX_ACTIVE_PREVIEW} more active`
                    : ""

                task.output = `Completed ${completed}/${tables.length} | Active ${activeLoads.size}/${parallelism}${activeList ? `\n${activeList}${extraActive}` : ""}`
              }

              updateOutput()

              const worker = async () => {
                while (queue.length > 0) {
                  const table = queue.shift()
                  if (!table) {
                    return
                  }

                  activeLoads.add(table)
                  updateOutput()

                  await executePull({
                    dataSource,
                    dataSourceName,
                    catalog,
                    schema,
                    tables: [table],
                    resolvedTargetPath,
                    skipRegistry: true,
                    sourcePathOverride: cliOverride,
                  })

                  activeLoads.delete(table)
                  completed += 1
                  updateOutput()
                }
              }

              await Promise.all(
                Array.from({ length: parallelism }, () => worker())
              )

              task.output = `Completed ${completed}/${tables.length}`
            },
          },
          {
            title: "Create registry",
            enabled: !skipRegistry,
            task: async () => {
              await runConfigRegistryGeneration(cliOverride)
            },
          },
        ],
        { concurrent: false, exitOnError: true, ...listrRendererOptions() }
      )

      await pullTasks.run()

      // oxlint-disable-next-line no-console
      console.log(
        success(
          `Pull completed: ${tables.length} item(s) generated under ${resolvedTargetPath}/schemas/generated/${dataSourceName}/${catalog}/${schema}`
        )
      )
    } finally {
      await dataSource.close()
    }
  })

  return pullCommand
}
