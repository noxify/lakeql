import { DataSourceConfigError } from "../errors/data-source-config-error"
import { UnknownAdapterError } from "../errors/unknown-adapter-error"
import { defaultMerge } from "./default-merge"
import type { ResolvedPaging } from "./resolve-paging"
import { resolvePaging } from "./resolve-paging"

/**
 * Validates a data source's merged connection and, when the adapter opts in by
 * declaring `validateWriteConfig`, its merged `writeConfig`.
 *
 * Connection validation runs first so a connection error takes priority.
 * `writeConfig` validation runs only when the adapter declares a validator and
 * a `writeConfig` value is present; adapters without one keep passing
 * `writeConfig` through opaquely. Thrown validation errors are wrapped in a
 * {@link DataSourceConfigError} carrying the source and adapter names.
 *
 * @param adapterDef - The resolved adapter definition record.
 * @param sourceName - The configured data-source name, for error context.
 * @param adapterName - The adapter name, for error context.
 * @param merged - The merged connection and optional writeConfig to validate.
 * @throws {DataSourceConfigError} When connection or writeConfig validation fails.
 */
function validateMergedConfig(
  adapterDef: Record<string, unknown>,
  sourceName: string,
  adapterName: string,
  merged: { connection: unknown; writeConfig?: unknown }
): void {
  try {
    ;(adapterDef.validateDataSourceConfig as (config: unknown) => void)(
      merged.connection
    )
  } catch (error: unknown) {
    throw new DataSourceConfigError(
      `Data source "${sourceName}" failed adapter validation`,
      sourceName,
      adapterName,
      error
    )
  }

  if (
    typeof adapterDef.validateWriteConfig !== "function" ||
    merged.writeConfig === undefined
  ) {
    return
  }

  try {
    ;(adapterDef.validateWriteConfig as (config: unknown) => void)(
      merged.writeConfig
    )
  } catch (error: unknown) {
    throw new DataSourceConfigError(
      `Data source "${sourceName}" failed adapter writeConfig validation`,
      sourceName,
      adapterName,
      error
    )
  }
}

/**
 * Processes each data source in definition order: resolves its adapter,
 * merges configuration (via custom merge or default shallow merge), validates
 * the merged connection, and stores the normalized result.
 *
 * Stops at the first failing data source — subsequent entries are not
 * processed after a failure.
 *
 * @param dataSources - The raw data-source record from the user's config input.
 * @param adapters - The validated adapter definitions array (already confirmed
 *   non-empty with unique, matching names).
 * @param globalPaging - Optional config-level paging defaults applied to each
 *   source that supplies no per-source override.
 * @returns A record mapping each data-source name to its normalized
 *   `{ adapter, connection, writeConfig?, paging }` value.
 * @throws {DataSourceConfigError} When a data-source entry is malformed,
 *   references an unknown adapter, fails custom merge, fails structural
 *   validation of the merge result, fails adapter validation, or carries
 *   invalid paging values.
 */
export function processDataSources(
  dataSources: Record<string, unknown>,
  adapters: readonly Record<string, unknown>[],
  globalPaging?: { defaultPerPage?: number; maxRecordsPerPage?: number }
): Record<
  string,
  {
    adapter: string
    connection: unknown
    writeConfig?: unknown
    impersonationResolver?: unknown
    paging: ResolvedPaging
  }
> {
  // Build adapter lookup map keyed by adapterName
  const adapterMap = new Map<string, Record<string, unknown>>()
  const registeredNames: string[] = []

  for (const adapter of adapters) {
    const name = adapter.adapterName as string
    adapterMap.set(name, adapter)
    registeredNames.push(name)
  }

  const result: Record<
    string,
    {
      adapter: string
      connection: unknown
      writeConfig?: unknown
      impersonationResolver?: unknown
      paging: ResolvedPaging
    }
  > = {}

  for (const [sourceName, entry] of Object.entries(dataSources)) {
    // Reject malformed entries (null or non-object)
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new DataSourceConfigError(
        `Data source "${sourceName}" must be a non-null object`,
        sourceName,
        undefined,
        new TypeError("data source entry must be a non-null object")
      )
    }

    const sourceEntry = entry as Record<string, unknown>
    const adapterName = sourceEntry.adapter as string

    // Resolve adapter by name
    const adapterDef = adapterMap.get(adapterName)
    if (adapterDef === undefined) {
      const unknownError = new UnknownAdapterError(adapterName, registeredNames)
      throw new DataSourceConfigError(
        `Data source "${sourceName}" references unknown adapter "${adapterName}"`,
        sourceName,
        undefined,
        unknownError
      )
    }

    const { registrationOptions } = adapterDef
    const { connection, writeConfig, overrides } = sourceEntry

    let merged: { connection: unknown; writeConfig?: unknown }

    if (typeof adapterDef.mergeDataSourceConfig === "function") {
      // Custom merge path: pass undefined unchanged for missing values.
      const sourceConfig: {
        connection: unknown
        writeConfig?: unknown
        overrides?: unknown
      } = { connection }

      if (writeConfig !== undefined) {
        sourceConfig.writeConfig = writeConfig
      }

      if (overrides !== undefined) {
        sourceConfig.overrides = overrides
      }

      try {
        const mergeResult = (
          adapterDef.mergeDataSourceConfig as (
            registrationOptions: unknown,
            sourceConfig: unknown
          ) => unknown
        )(registrationOptions, sourceConfig)

        // Validate structural result
        if (
          mergeResult === null ||
          mergeResult === undefined ||
          typeof mergeResult !== "object" ||
          Array.isArray(mergeResult)
        ) {
          throw new DataSourceConfigError(
            `Data source "${sourceName}": mergeDataSourceConfig() must return a non-null object with a "connection" field`,
            sourceName,
            adapterName,
            new TypeError("mergeDataSourceConfig() returned a non-object value")
          )
        }

        if (!("connection" in (mergeResult as object))) {
          throw new DataSourceConfigError(
            `Data source "${sourceName}": mergeDataSourceConfig() result is missing the required "connection" field`,
            sourceName,
            adapterName,
            new TypeError(
              'mergeDataSourceConfig() result is missing "connection" field'
            )
          )
        }

        merged = mergeResult as { connection: unknown; writeConfig?: unknown }
      } catch (error: unknown) {
        // If the error is already a DataSourceConfigError we threw for structural validation, re-throw
        if (error instanceof DataSourceConfigError) {
          throw error
        }
        // Wrap any thrown error from the merge function.
        throw new DataSourceConfigError(
          `Data source "${sourceName}": mergeDataSourceConfig() threw during merge`,
          sourceName,
          adapterName,
          error
        )
      }
    } else {
      // Default merge path
      merged = defaultMerge(
        sourceName,
        adapterName,
        registrationOptions,
        connection,
        overrides,
        writeConfig
      )
    }

    // Validate merged connection, then (when opted in) the merged writeConfig.
    validateMergedConfig(adapterDef, sourceName, adapterName, merged)

    // Resolve per-source paging from raw entry values and global defaults.
    const rawDefaultPerPage = sourceEntry.defaultPerPage as number | undefined
    const rawMaxRecordsPerPage = sourceEntry.maxRecordsPerPage as
      | number
      | undefined
    const paging = resolvePaging({
      sourceName,
      adapterName,
      perSource: {
        defaultPerPage: rawDefaultPerPage,
        maxRecordsPerPage: rawMaxRecordsPerPage,
      },
      globalDefaults: globalPaging,
    })

    // Store normalized result
    const normalized: {
      adapter: string
      connection: unknown
      writeConfig?: unknown
      impersonationResolver?: unknown
      paging: ResolvedPaging
    } = {
      adapter: adapterName,
      connection: merged.connection,
      paging,
    }

    if (merged.writeConfig !== undefined) {
      normalized.writeConfig = merged.writeConfig
    }

    // Pass the per-source impersonation resolver through as an opaque
    // runtime object (never merged, cloned, or serialized).
    if (sourceEntry.impersonationResolver !== undefined) {
      normalized.impersonationResolver = sourceEntry.impersonationResolver
    }

    result[sourceName] = normalized
  }

  return result
}
