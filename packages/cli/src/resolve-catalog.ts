import type { DataSource } from "@lakeql/datasource"
import { select } from "@topcli/prompts"

import { CliError } from "@/errors"

/**
 * Resolves a catalog for a data source command.
 *
 * Resolution order:
 * 1. Explicit `--catalog` CLI flag.
 * 2. Connection-level catalog from the data source config
 *    (skipping generic defaults like `"master"`).
 * 3. Interactive prompt listing catalogs from the live data source.
 *
 * @param opts.dataSource - Live data source instance.
 * @param opts.catalogFlag - Optional `--catalog` CLI flag value.
 * @param opts.connectionCatalog - Catalog configured in the data source connection, if any.
 * @returns The resolved catalog name.
 */
export async function resolveCatalog(opts: {
  dataSource: DataSource
  catalogFlag?: string
  connectionCatalog?: string
}): Promise<string> {
  const { dataSource, catalogFlag, connectionCatalog } = opts

  // CLI flag takes precedence
  if (catalogFlag) {
    return catalogFlag
  }

  // Connection config catalog (skip generic defaults)
  if (connectionCatalog && connectionCatalog !== "master") {
    return connectionCatalog
  }

  // Interactive: list catalogs from the data source
  const catalogs = await dataSource.catalogs()

  if (catalogs.length === 0) {
    throw new CliError("No catalogs found in the data source.", {
      code: "NO_CATALOGS",
      hint: "Verify connection settings and permissions in lakeql.config.ts.",
    })
  }

  if (catalogs.length === 1) {
    const [first] = catalogs
    return first as string
  }

  return select("Choose a catalog", { choices: catalogs })
}
