import { Command } from "@commander-js/extra-typings"
import { TrinoClient } from "@lakeql/trino-client"
import { select } from "@topcli/prompts"
import { ClimtTable } from "climt"

import { getEnv } from "@/env"
import { catalogOption, schemaOption, tableOption } from "@/options"

export default function listColumnsCommand() {
  const program = new Command("list-columns")
  program
    .description("Lists the columns for the specified table")
    .addOption(catalogOption)
    .addOption(schemaOption.makeOptionMandatory())
    .addOption(tableOption.makeOptionMandatory())

    .action(async ({ catalog, schema, table }) => {
      const env = getEnv()
      const resolvedCatalog = catalog ?? env.HIVE_CATALOG
      const trinoClient = new TrinoClient({
        auth: {
          password: env.HIVE_PASSWORD,
          type: "basic",
          username: env.HIVE_USERNAME,
        },
        catalog: resolvedCatalog,
        host: env.HIVE_HOST,
        port: env.HIVE_PORT,
      })

      let resolvedSchema = schema
      if (resolvedSchema === undefined) {
        const remoteSchemas = await trinoClient.schemas({
          catalog: resolvedCatalog,
        })

        resolvedSchema = await select(
          `Choose a schema from the ${resolvedCatalog} catalog`,
          {
            autocomplete: true,
            choices: remoteSchemas,
          }
        )
      }

      let resolvedTable = table
      if (resolvedTable === undefined) {
        const remoteTables = await trinoClient.tables({
          catalog: resolvedCatalog,
          schema: resolvedSchema,
        })

        resolvedTable = await select(
          `Choose a table from "${resolvedCatalog}.${resolvedSchema}"`,
          {
            autocomplete: true,
            choices: remoteTables,
          }
        )
      }

      const columns = await trinoClient.columns({
        catalog: resolvedCatalog,
        schema: resolvedSchema,
        table: resolvedTable,
      })

      const transformedColumns = columns.map(
        ([name, type, extra, description]) => ({
          description,
          extra,
          name,
          type,
        })
      )

      const cliTable = new ClimtTable()
      cliTable.column("Column Name", "name")
      cliTable.column("Type", "type")
      cliTable.column("Extra", "extra")
      cliTable.column("Description", "description")
      cliTable.render(transformedColumns)
    })

  return program
}
