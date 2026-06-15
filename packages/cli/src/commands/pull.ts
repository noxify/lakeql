// oxlint-disable no-await-in-loop
import path from "node:path"

import { Command } from "@commander-js/extra-typings"
import { parseColumns } from "@lakeql/column-parser"
import { error } from "@lakeql/logger/console"
import { convertTrinoResponse } from "@lakeql/response-transformer"
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
import { generateEndpoint } from "@/pipeline/generate"
import { trinoColumnsToDefinition } from "@/pipeline/trino-to-definition"

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

  pullCommand.action(async (props) => {
    const env = getEnv()
    const { skipRegistry, sourcePath } = props
    const catalog = props.catalog ?? env.HIVE_CATALOG
    let { schema, table: tables, type } = props

    // CLI --source-path overrides config; if it's the default (invocation cwd), use config
    const cliOverride =
      // oxlint-disable-next-line no-restricted-properties
      sourcePath === (process.env.INIT_CWD ?? process.cwd())
        ? undefined
        : sourcePath
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
      let remoteTables: string[] = []
      remoteTables =
        type === "views"
          ? await trinoClient.views({ catalog, schema })
          : await trinoClient.tables({ catalog, schema })

      if (remoteTables.length === 0) {
        program.error(
          error(`There are no tables in schema '${catalog}.${schema}'.`),
          {
            exitCode: 0,
          }
        )
      }

      tables = await multiselect("Choose the tables to pull", {
        autocomplete: true,
        choices: remoteTables,
        validators: [validators.required()],
      })
    }

    for (const table of tables) {
      const columns = await trinoClient.columns({
        catalog,
        schema,
        table,
      })

      const transformedResponse = columns.map((values) =>
        convertTrinoResponse<{
          name: string
          type: string
          extra: string
          description: string
        }>({
          keys: ["name", "type", "extra", "description"],
          values,
        })
      )

      const parsedColumns = parseColumns(transformedResponse)

      // Convert Trino columns to EndpointDefinitionFormat
      const definition = trinoColumnsToDefinition({
        tableName: table,
        catalog,
        schema,
        parsedColumns,
      })

      // Compute output directory
      const targetPath = path.join(
        resolvedTargetPath,
        "schemas/generated",
        catalog,
        schema,
        table
      )

      // Generate using the unified pipeline
      await generateEndpoint({
        definition,
        outputDir: targetPath,
        skipRegistry,
        sourcePathOverride: cliOverride,
      })
    }
  })

  return pullCommand
}
