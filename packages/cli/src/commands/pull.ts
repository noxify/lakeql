// oxlint-disable no-await-in-loop
import { Command, Option } from "@commander-js/extra-typings"
import { error } from "@lakeql/logger/console"
import { TrinoClient } from "@lakeql/trino-client"
import { multiselect, select, validators } from "@topcli/prompts"

import { resolveSourcePath } from "@/config"
import { getEnv } from "@/env"
import {
  catalogOption,
  schemaOption,
  skipRegistry as skipRegistryOption,
  sourcePathOption,
  tableOption,
  tableOrSchemaOption,
} from "@/options"

import { executeBulkPull } from "./bulk-pull"
import { executePull } from "./pull-action"

const bulkOption = new Option(
  "--bulk",
  "Run in bulk mode using a config file"
).default(false)

const bulkConfigOption = new Option(
  "--bulk-config <path>",
  "Path to the bulk import config file (default: import.config.mjs)"
).default("import.config.mjs")

export default function PullCommand() {
  const program = new Command("pull")
  const pullCommand = program
    .description(
      "Interactive query endpoint generation based on a remote table"
    )
    .addOption(catalogOption)
    .addOption(tableOrSchemaOption)
    .addOption(schemaOption.makeOptionMandatory(false))
    .addOption(
      tableOption
        .makeOptionMandatory(false)
        .default([])
        .argParser((value, previous: string[]) => [...previous, value])
    )
    .addOption(skipRegistryOption)
    .addOption(sourcePathOption)
    .addOption(bulkOption)
    .addOption(bulkConfigOption)

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

    const resolvedTargetPath = resolveSourcePath(cliOverride)

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
      const remoteSchemas = await trinoClient.schemas({ catalog })

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
      remoteTables =
        type === "views"
          ? await trinoClient.views({ catalog, schema })
          : await trinoClient.tables({ catalog, schema })

      if (remoteTables.length === 0) {
        program.error(
          error(`There are no ${type} in schema '${catalog}.${schema}'.`),
          {
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

    await executePull({
      trinoClient,
      catalog,
      schema,
      tables: [...tables],
      resolvedTargetPath,
      skipRegistry,
      sourcePathOverride: cliOverride,
    })
  })

  return pullCommand
}
