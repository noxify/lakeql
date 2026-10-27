import { ClimtTable } from "climt"

import { createDataSourceConnectionError } from "@/errors"
import { resolveCatalog } from "@/resolve-catalog"
import { resolveDataSource } from "@/resolve-datasource"

import { buildListSchemasCommandStructure } from "../metadata/list-schemas-metadata"

export default function listSchemasCommand() {
  const program = buildListSchemasCommandStructure()
  program.action(async ({ source, catalog }) => {
    const { instance: dataSource, config } = await resolveDataSource(source)

    try {
      const resolvedCatalog = await resolveCatalog({
        dataSource,
        catalogFlag: catalog,
        connectionCatalog: (config.connection as { catalog?: string })?.catalog,
      })

      let schemas: string[]
      try {
        schemas = await dataSource.schemas(resolvedCatalog)
      } catch (error) {
        throw createDataSourceConnectionError(
          "list schemas",
          `list-schemas (catalog=${resolvedCatalog})`,
          error
        )
      }

      const table = new ClimtTable()
      table.column("Schema Name", "s")
      table.render(
        schemas.map((schemaName) => ({
          s: schemaName,
        }))
      )
    } finally {
      await dataSource.close()
    }
  })

  return program
}
