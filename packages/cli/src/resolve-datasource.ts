import type { DataSource } from "@lakeql/datasource"
import { select } from "@topcli/prompts"

import { loadConfig } from "@/config"
import { CliError } from "@/errors"

/**
 * A resolved data source with its configured name, live instance,
 * and adapter metadata.
 */
export interface ResolvedDataSource {
  /** Configured name from `lakeql.config`. */
  name: string
  /** Live data source instance created by the adapter factory. */
  instance: DataSource
  /** Adapter identifier and opaque connection configuration. */
  config: { adapter: string; connection: unknown }
}

/**
 * Resolves a {@link DataSource} from the loaded project configuration.
 *
 * When `sourceName` is provided it must match a configured data source
 * name. When omitted:
 *
 * - If only one data source is configured, it is selected automatically.
 * - If multiple data sources are configured, an interactive prompt is shown.
 *
 * @param sourceName - Optional `--source` CLI flag value.
 * @returns The resolved data source name, live instance, and config.
 */
export async function resolveDataSource(
  sourceName?: string
): Promise<ResolvedDataSource> {
  const project = await loadConfig()
  const { dataSources } = project.config
  const available = Object.keys(dataSources)

  if (available.length === 0) {
    throw new CliError("No data sources configured.", {
      code: "NO_DATASOURCES",
      hint: "Add at least one data source to lakeql.config.ts.",
    })
  }

  let selectedName: string

  if (sourceName) {
    if (!available.includes(sourceName)) {
      throw new CliError(
        `Data source "${sourceName}" not found. Available: ${available.join(", ")}`,
        { code: "DATASOURCE_NOT_FOUND" }
      )
    }
    selectedName = sourceName
  } else if (available.length === 1) {
    const [first] = available
    selectedName = first as string
  } else {
    selectedName = await select("Choose a data source", {
      choices: available,
    })
  }

  const definition = dataSources[selectedName]
  if (!definition) {
    throw new CliError(
      `Data source "${selectedName}" not found in configuration.`,
      { code: "DATASOURCE_NOT_FOUND" }
    )
  }

  // Find the matching adapter factory
  const factory = project.adapters.find(
    (f) => f.adapterName === definition.adapter
  )

  if (!factory) {
    throw new CliError(
      `No adapter factory found for "${definition.adapter}".`,
      {
        code: "ADAPTER_NOT_FOUND",
        hint: `Ensure the "${definition.adapter}" adapter is registered in your lakeql.config.ts.`,
      }
    )
  }

  const instance = factory.createDataSource(definition.connection, selectedName)

  return {
    name: selectedName,
    instance,
    config: { adapter: definition.adapter, connection: definition.connection },
  }
}
