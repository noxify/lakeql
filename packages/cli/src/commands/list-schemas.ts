import { Command } from "@commander-js/extra-typings"
import { TrinoClient } from "@lakeql/trino-client"
import { ClimtTable } from "climt"

import { getEnv } from "@/env"
import { catalogOption } from "@/options"

export default function listSchemasCommand() {
  const program = new Command("list-schemas")
  program
    .description("Lists the available schemas for the configured catalog")
    .addOption(catalogOption)
    .action(async ({ catalog }) => {
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

      const schemas = await trinoClient.schemas({ catalog: resolvedCatalog })

      const table = new ClimtTable()
      table.column("Schema Name", "s")
      table.render(
        schemas.map((schemaName) => ({
          s: schemaName,
        }))
      )
    })

  return program
}
