import { select } from "@topcli/prompts"
import { ClimtTable } from "climt"

import { createDataSourceConnectionError } from "@/errors"
import { resolveCatalog } from "@/resolve-catalog"
import { resolveDataSource } from "@/resolve-datasource"

import { buildListColumnsCommandStructure } from "../metadata/list-columns-metadata"

export default function listColumnsCommand() {
  const program = buildListColumnsCommandStructure()
  program.action(async ({ source, catalog, schema, table }) => {
    const { instance: dataSource, config } = await resolveDataSource(source)

    try {
      const resolvedCatalog = await resolveCatalog({
        dataSource,
        catalogFlag: catalog,
        connectionCatalog: (config.connection as { catalog?: string })?.catalog,
      })

      let resolvedSchema = schema
      if (resolvedSchema === undefined) {
        let remoteSchemas: string[]
        try {
          remoteSchemas = await dataSource.schemas(resolvedCatalog)
        } catch (error) {
          throw createDataSourceConnectionError(
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
          remoteTables = await dataSource.tables(
            resolvedCatalog,
            resolvedSchema
          )
        } catch (error) {
          throw createDataSourceConnectionError(
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

      let columns: {
        name: string
        type: string
        extra?: string
        description?: string
      }[]
      try {
        columns = await dataSource.columns(
          resolvedCatalog,
          resolvedSchema,
          resolvedTable
        )
      } catch (error) {
        throw createDataSourceConnectionError(
          "list columns",
          `list-columns (catalog=${resolvedCatalog}, schema=${resolvedSchema}, table=${resolvedTable})`,
          error
        )
      }

      const cliTable = new ClimtTable()
      cliTable.column("Column Name", "name")
      cliTable.column("Type", "type")
      cliTable.column("Extra", "extra")
      cliTable.column("Description", "description")
      cliTable.render(
        columns.map((col) => ({
          name: col.name,
          type: col.type,
          extra: col.extra ?? "",
          description: col.description ?? "",
        }))
      )
    } finally {
      await dataSource.close()
    }
  })

  return program
}
