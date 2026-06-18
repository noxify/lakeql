import { TrinoClient } from "@lakeql/trino-client"
import { select } from "@topcli/prompts"
import { ClimtTable } from "climt"

import { getEnv } from "@/env"
import { createTrinoConnectionError } from "@/errors"

import { buildListViewsCommandStructure } from "../metadata/list-views-metadata"

export default function listViewsCommand() {
  const program = buildListViewsCommandStructure()
  program.action(async ({ catalog, schema }) => {
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
      let remoteSchemas: string[]
      try {
        remoteSchemas = await trinoClient.schemas({
          catalog: resolvedCatalog,
        })
      } catch (error) {
        throw createTrinoConnectionError(
          "list schemas",
          `list-views (catalog=${resolvedCatalog})`,
          error
        )
      }

      resolvedSchema = await select(
        `Choose a schema from the ${resolvedCatalog} catalog`,
        {
          choices: remoteSchemas,
        }
      )
    }

    let remoteViews: string[]
    try {
      remoteViews = await trinoClient.views({
        catalog: resolvedCatalog,
        schema: resolvedSchema,
      })
    } catch (error) {
      throw createTrinoConnectionError(
        "list views",
        `list-views (catalog=${resolvedCatalog}, schema=${resolvedSchema})`,
        error
      )
    }

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
