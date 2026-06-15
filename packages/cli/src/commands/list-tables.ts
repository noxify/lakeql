import { Command } from "@commander-js/extra-typings"
import { TrinoClient } from "@lakeql/trino-client"
import { select } from "@topcli/prompts"
import { ClimtTable } from "climt"

import { env } from "@/env"
import { catalogOption, schemaOption } from "@/options"

export default function listTablesCommand() {
  const program = new Command("list-tables")
  program
    .description("Lists the available tables for the configured catalog/schema")
    .addOption(catalogOption(env.HIVE_CATALOG))
    .addOption(schemaOption)

    .action(async ({ catalog, schema }) => {
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

      let resolvedSchema = schema
      if (resolvedSchema === undefined) {
        const remoteSchemas = await trinoClient.schemas({ catalog })

        resolvedSchema = await select(
          `Choose a schema from the ${catalog} catalog`,
          {
            autocomplete: true,
            choices: remoteSchemas,
          }
        )
      }

      const tables = await trinoClient.tables({
        catalog,
        schema: resolvedSchema,
      })

      const table = new ClimtTable()
      table.column("Table Name", "t")
      table.render(
        tables.map((tableName) => ({
          t: tableName,
        }))
      )
    })

  return program
}
