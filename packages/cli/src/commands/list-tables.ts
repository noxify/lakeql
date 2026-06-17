import { TrinoClient } from "@lakeql/trino-client"
import { select } from "@topcli/prompts"
import { ClimtTable } from "climt"

import { getEnv } from "@/env"

import { buildListTablesCommandStructure } from "../metadata/list-tables-metadata"

export default function listTablesCommand() {
  const program = buildListTablesCommandStructure()

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

    const tables = await trinoClient.tables({
      catalog: resolvedCatalog,
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
