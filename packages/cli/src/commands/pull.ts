// oxlint-disable no-await-in-loop
import { info, success } from "@lakeql/logger/console"
import { TrinoClient } from "@lakeql/trino-client"
import { multiselect, select, validators } from "@topcli/prompts"
import { Listr } from "listr2"

import { runConfigRegistryGeneration } from "@/commands/create-registry"
import { resolveSourcePath } from "@/config"
import { getEnv } from "@/env"
import { CliError, createTrinoConnectionError } from "@/errors"

import { buildPullCommandStructure } from "../metadata/pull-metadata"
import { executeBulkPull } from "./bulk-pull"
import { executePull } from "./pull-action"

async function withTrinoContext<T>(
  action: string,
  context: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw createTrinoConnectionError(action, context, error)
  }
}

export default function PullCommand() {
  const pullCommand = buildPullCommandStructure()

  pullCommand.action(async (props) => {
    const { skipRegistry, sourcePath, bulk, bulkConfig } = props

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
        sourcePathOverride: cliOverride,
        skipRegistry,
      })
      return
    }

    // Interactive / single-schema mode
    const env = getEnv()
    const catalog = props.catalog ?? env.HIVE_CATALOG
    let { schema, table: tables, type } = props

    const resolvedTargetPath = await resolveSourcePath(cliOverride)

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

    if (!schema) {
      const remoteSchemas = await withTrinoContext(
        "list schemas",
        `pull (catalog=${catalog})`,
        () => trinoClient.schemas({ catalog })
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
      remoteTables = await withTrinoContext(
        type === "views" ? "list views" : "list tables",
        `pull (catalog=${catalog}, schema=${schema})`,
        () =>
          type === "views"
            ? trinoClient.views({ catalog, schema })
            : trinoClient.tables({ catalog, schema })
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
        `Pulling ${tables.length} item(s) from ${catalog}.${schema} into ${resolvedTargetPath}/schemas/generated...`
      )
    )

    const pullTasks = new Listr(
      [
        {
          title: `Pull ${tables.length} item(s)`,
          task: (_, task) =>
            task.newListr(
              tables.map((table) => ({
                title: `${catalog}.${schema}.${table}`,
                task: async () => {
                  await executePull({
                    trinoClient,
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
              { concurrent: false, exitOnError: true }
            ),
        },
        {
          title: "Create registry",
          enabled: !skipRegistry,
          task: async () => {
            await runConfigRegistryGeneration(cliOverride)
          },
        },
      ],
      { concurrent: false, exitOnError: true }
    )

    await pullTasks.run()

    // oxlint-disable-next-line no-console
    console.log(
      success(
        `Pull completed: ${tables.length} item(s) generated under ${resolvedTargetPath}/schemas/generated/${catalog}/${schema}`
      )
    )
  })

  return pullCommand
}
