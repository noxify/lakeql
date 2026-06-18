import { TrinoClient } from "@lakeql/trino-client"
import { select } from "@topcli/prompts"
import { ClimtTable } from "climt"

import { getEnv } from "@/env"
import { createTrinoConnectionError } from "@/errors"

import { buildListColumnsCommandStructure } from "../metadata/list-columns-metadata"

export default function listColumnsCommand() {
  const program = buildListColumnsCommandStructure()
  program.action(async ({ catalog, schema, table }) => {
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
          `list-columns (catalog=${resolvedCatalog})`,
          error
        )
      }

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
      let remoteTables: string[]
      try {
        remoteTables = await trinoClient.tables({
          catalog: resolvedCatalog,
          schema: resolvedSchema,
        })
      } catch (error) {
        throw createTrinoConnectionError(
          "list tables",
          `list-columns (catalog=${resolvedCatalog}, schema=${resolvedSchema})`,
          error
        )
      }

      resolvedTable = await select(
        `Choose a table from "${resolvedCatalog}.${resolvedSchema}"`,
        {
          autocomplete: true,
          choices: remoteTables,
        }
      )
    }

    let columns: [string, string, string, string][]
    try {
      columns = await trinoClient.columns({
        catalog: resolvedCatalog,
        schema: resolvedSchema,
        table: resolvedTable,
      })
    } catch (error) {
      throw createTrinoConnectionError(
        "list columns",
        `list-columns (catalog=${resolvedCatalog}, schema=${resolvedSchema}, table=${resolvedTable})`,
        error
      )
    }

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
