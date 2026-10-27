// oxlint-disable no-await-in-loop
// Sequential iteration is required by design: each data-source definition
// depends on the result of its factory calls before the next can proceed,
// and close() must attempt every data source regardless of prior failures.

import type {
  DataSource,
  DataSourceReadStrategy,
  DataSourceWriteStrategy,
} from "@lakeql/datasource"

import { AdapterRegistry } from "./adapter-registry"
import { RuntimeConstructionError } from "./errors/runtime-construction-error"
import { LakeQLRuntimeImpl } from "./runtime"
import type { CreateLakeQLRuntimeOptions, LakeQLRuntime } from "./types"

/**
 * Closes all data sources in the provided map, collecting any errors
 * without allowing them to interrupt cleanup of remaining sources.
 *
 * @param dataSources - Map of named data sources to close.
 * @returns An array of errors thrown by individual `close()` calls.
 */
async function cleanupDataSources(
  dataSources: Map<string, DataSource>
): Promise<unknown[]> {
  const cleanupErrors: unknown[] = []
  for (const ds of dataSources.values()) {
    try {
      await ds.close()
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  return cleanupErrors
}

/**
 * Attaches cleanup errors as a `cleanupErrors` property on the primary
 * error when any cleanup failures occurred during composition rollback.
 *
 * @param error - The primary error to annotate.
 * @param cleanupErrors - Errors from data-source close attempts.
 */
function attachCleanupErrors(error: unknown, cleanupErrors: unknown[]): void {
  if (cleanupErrors.length > 0 && error instanceof Error) {
    ;(error as Error & { cleanupErrors?: unknown[] }).cleanupErrors =
      cleanupErrors
  }
}

/**
 * Composes a {@link LakeQLRuntime} from loaded configuration, explicit
 * adapter factories, and an auth resolver.
 *
 * Construction is sequential: each configured data-source definition is
 * resolved through the registry and its factory methods are called in
 * order (`createDataSource`, `createReadStrategy`, optionally
 * `createWriteStrategy`). The function resolves only after every
 * configured source has been fully composed.
 *
 * An empty `dataSources` map produces a valid empty runtime.
 *
 * If composition fails after one or more data sources have been created,
 * all previously created data sources are closed before the error
 * propagates. Cleanup failures are attached as secondary diagnostics
 * and never replace the primary error.
 *
 * @param options - Configuration, adapter factories, and auth resolver.
 * @returns A composed runtime owning all created instances.
 * @throws {DuplicateAdapterError} When the factory list contains
 *   duplicate adapter names.
 * @throws {UnknownAdapterError} When a configured adapter name has no
 *   matching factory in the registry.
 * @throws {RuntimeConstructionError} When a factory method fails during
 *   composition.
 */
export async function createLakeQLRuntime(
  options: CreateLakeQLRuntimeOptions
): Promise<LakeQLRuntime> {
  const { config, adapters, resolveAuth } = options

  // Step 1: Construct the registry. DuplicateAdapterError propagates
  // before any factory call — no cleanup needed since no data sources
  // have been created yet.
  const registry = new AdapterRegistry(adapters)

  // Step 2: Iterate data-source definitions sequentially.
  const dataSources = new Map<string, DataSource>()
  const readStrategies = new Map<string, DataSourceReadStrategy>()
  const writeStrategies = new Map<string, DataSourceWriteStrategy>()

  try {
    for (const [name, definition] of Object.entries(config.dataSources)) {
      // Resolve factory via registry — throws UnknownAdapterError if missing.
      // UnknownAdapterError propagates directly (already structured).
      const factory = registry.getOrThrow(definition.adapter)

      // Create the data source
      let dataSource: DataSource
      try {
        dataSource = await factory.createDataSource(definition.connection, name)
      } catch (error) {
        throw new RuntimeConstructionError(name, definition.adapter, error)
      }
      dataSources.set(name, dataSource)

      // Create the read strategy bound to this data source
      try {
        const readStrategy = await factory.createReadStrategy({
          dataSource,
          resolveAuth,
          paging: definition.paging,
        })
        readStrategies.set(name, readStrategy)
      } catch (error) {
        throw new RuntimeConstructionError(name, definition.adapter, error)
      }

      // Create the write strategy when writeConfig is present
      if (definition.writeConfig !== undefined) {
        try {
          const writeStrategy = await factory.createWriteStrategy({
            dataSource,
            dataSourceName: name,
            writeConfig: definition.writeConfig,
          })
          writeStrategies.set(name, writeStrategy)
        } catch (error) {
          throw new RuntimeConstructionError(name, definition.adapter, error)
        }
      }
    }
  } catch (error) {
    // Clean up any data sources created before the failure
    if (dataSources.size > 0) {
      const cleanupErrors = await cleanupDataSources(dataSources)
      attachCleanupErrors(error, cleanupErrors)
    }
    throw error
  }

  // Frozen snapshot of configured source names for error reporting
  const sourceNames = Object.freeze([...dataSources.keys()])

  return new LakeQLRuntimeImpl(
    dataSources,
    readStrategies,
    writeStrategies,
    sourceNames
  )
}
