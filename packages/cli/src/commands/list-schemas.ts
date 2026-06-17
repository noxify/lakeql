import { TrinoClient } from "@lakeql/trino-client"
import { ClimtTable } from "climt"

import { getEnv } from "@/env"

import { buildListSchemasCommandStructure } from "../metadata/list-schemas-metadata"

export default function listSchemasCommand() {
  const program = buildListSchemasCommandStructure()
  program.action(async ({ catalog }) => {
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
