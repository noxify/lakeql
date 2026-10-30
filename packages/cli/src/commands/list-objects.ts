import type { Command } from "@commander-js/extra-typings"
import type { DataSource } from "@lakeql/datasource"
import { select } from "@topcli/prompts"
import { ClimtTable } from "climt"

import { createDataSourceConnectionError } from "@/errors"
import { resolveCatalog } from "@/resolve-catalog"
import { resolveDataSource } from "@/resolve-datasource"

/**
 * Configuration for a concrete object-listing command. The `list-tables` and
 * `list-views` commands are identical apart from the values below.
 */
interface ListObjectsCommandOptions {
  /** The command structure (name, description, options). */
  structure: Command<[], { source?: string; catalog?: string; schema?: string }>
  /** The noun used in the rendered column header (e.g. `"Table"`). */
  label: string
  /** The single-letter key used for the rendered Climt column. */
  columnKey: string
  /** The error-context verb used when the data-source lookup fails. */
  errorVerb: string
  /** Fetches the object names for the resolved catalog and schema. */
  fetch: (
    dataSource: DataSource,
    catalog: string,
    schema: string
  ) => Promise<string[]>
}

/**
 * Builds an object-listing command (tables or views). Both resolve a data
 * source, resolve the catalog, prompt for the schema when omitted, fetch the
 * object names, and render them in a single-column table.
 *
 * @param options - The command-specific configuration.
 * @returns The configured Commander command with its action handler attached.
 */
export function listObjectsCommand(options: ListObjectsCommandOptions) {
  const { structure, label, columnKey, errorVerb, fetch } = options
  const program = structure
  const commandName = program.name()

  program.action(async ({ source, catalog, schema }) => {
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
            `${commandName} (catalog=${resolvedCatalog})`,
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

      let objects: string[]
      try {
        objects = await fetch(dataSource, resolvedCatalog, resolvedSchema)
      } catch (error) {
        throw createDataSourceConnectionError(
          errorVerb,
          `${commandName} (catalog=${resolvedCatalog}, schema=${resolvedSchema})`,
          error
        )
      }

      const table = new ClimtTable()
      table.column(`${label} Name`, columnKey)
      table.render(
        objects.map((name) => ({
          [columnKey]: name,
        }))
      )
    } finally {
      await dataSource.close()
    }
  })

  return program
}
