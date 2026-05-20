import { Command } from "@commander-js/extra-typings"
import { TrinoClient } from "@lakeql/trino-client"
import { select } from "@topcli/prompts"
import { ClimtTable } from "climt"

import { env } from "@/env"
import { catalogOption, schemaOption } from "@/options"

export default function listViewsCommand() {
  const program = new Command("list-views")
  program
    .description("Lists the available views for the configured catalog/schema")
    .addOption(catalogOption)
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
            choices: remoteSchemas,
          }
        )
      }

      const remoteViews = await trinoClient.views({
        catalog,
        schema: resolvedSchema,
      })

      const table = new ClimtTable()
      table.column("View Name", "v")
      table.render(
        remoteViews.map((viewName) => ({
          v: viewName,
        }))
      )
    })

  return program
}
