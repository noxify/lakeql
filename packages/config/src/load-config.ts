import { readdirSync } from "node:fs"
import path from "node:path"

import type { AdapterFactory } from "@lakeql/datasource"
import { loadConfig as loadC12Config } from "c12"

import { resolvePaging } from "./define-config/resolve-paging"
import type { LoadedLakeQLProject, RuntimeDataSourceDefinition } from "./types"

/**
 * File extensions supported by the LakeQL config loader.
 *
 * Only module-based formats are accepted because the config requires
 * runtime objects (class instances, functions, prototype-carrying objects)
 * that are not representable in non-module formats.
 */
export const SUPPORTED_CONFIG_EXTENSIONS: readonly string[] = [
  ".ts",
  ".mts",
  ".js",
  ".mjs",
]

/**
 * Validates that a config file path uses a supported extension.
 *
 * Supported extensions are `.ts`, `.mts`, `.js`, and `.mjs`. Any other
 * extension — including `.json`, `.cts`, and `.cjs` — is rejected with
 * an error that identifies the unsupported path and lists supported formats.
 *
 * @param configPath - Absolute or relative path to the candidate config file.
 * @throws {Error} When the file extension is not in the supported set.
 */
export function validateConfigExtension(configPath: string): void {
  const ext = path.extname(configPath)

  if (!SUPPORTED_CONFIG_EXTENSIONS.includes(ext)) {
    const supported = SUPPORTED_CONFIG_EXTENSIONS.map((e) => `"${e}"`).join(
      ", "
    )

    throw new Error(
      `Unsupported config file extension "${ext}" in "${configPath}". ` +
        `Supported extensions are: ${supported}.`
    )
  }
}

/**
 * Options accepted by `loadConfig()`.
 */
export interface LoadConfigOptions {
  /** Working directory in which to search for the project config file. */
  cwd?: string
}

/**
 * Scans a directory for `lakeql.config.*` files and rejects early if only
 * unsupported extensions are present. This ensures the user gets the
 * specific "unsupported extension" error instead of a generic
 * "no config found" message when c12 cannot locate a supported file.
 *
 * @param cwd - Directory to scan for config candidates.
 */
function rejectUnsupportedCandidates(cwd: string): void {
  const CONFIG_BASE = "lakeql.config"
  let dirEntries: string[] = []
  try {
    dirEntries = readdirSync(cwd)
  } catch {
    // If cwd is unreadable, let c12 produce its own error below.
    return
  }
  const candidateFiles = dirEntries.filter((f) =>
    f.startsWith(`${CONFIG_BASE}.`)
  )
  if (candidateFiles.length === 0) {
    return
  }
  const hasSupportedCandidate = candidateFiles.some((f) =>
    SUPPORTED_CONFIG_EXTENSIONS.includes(path.extname(f))
  )
  if (!hasSupportedCandidate) {
    // Reject the first unsupported candidate with the detailed error.
    validateConfigExtension(path.join(cwd, candidateFiles[0] ?? ""))
  }
}

/**
 * Normalizes the config's `adapters` array into runtime adapter factories.
 *
 * `defineConfig()` registers `AdapterDefinition` objects (which carry the
 * factory under a `factory` property), while the runtime consumes bare
 * `AdapterFactory` instances. This unwraps each definition to its factory so
 * `createLakeQLRuntime` receives what it expects. A value that is already a
 * factory (has `createDataSource`) is passed through unchanged. Non-array or
 * unrecognized entries yield an empty list.
 *
 * @param adapters - The raw `adapters` value from the config module.
 * @returns The resolved adapter factories.
 */
function resolveAdapterFactories(adapters: unknown): readonly AdapterFactory[] {
  if (!Array.isArray(adapters)) {
    return []
  }

  return adapters.map((entry) => {
    if (
      entry !== null &&
      typeof entry === "object" &&
      "factory" in entry &&
      entry.factory !== null &&
      typeof entry.factory === "object"
    ) {
      return entry.factory as AdapterFactory
    }
    return entry as AdapterFactory
  })
}

/**
 * Resolves per-source paging for a hand-authored or defineConfig-produced
 * `dataSources` map.
 *
 * Entries that already carry a resolved `paging` object (as produced by
 * `defineConfig`) are passed through untouched. Entries without one are
 * resolved via {@link resolvePaging} using guarded numeric reads of the raw
 * object's `defaultPerPage`/`maxRecordsPerPage` and the config-level globals.
 *
 * @param rawDataSources - The raw, untyped `dataSources` map from the config module.
 * @param globalDefaults - Config-level paging defaults, or `undefined`.
 * @returns A new map where every entry carries a resolved `paging` value.
 * @throws {DataSourceConfigError} When a per-source or global paging value is
 *   invalid, or the resolved invariant is violated.
 */
function resolveDataSourcesPaging(
  rawDataSources: Record<string, unknown>,
  globalDefaults:
    | { defaultPerPage?: number; maxRecordsPerPage?: number }
    | undefined
): Record<string, RuntimeDataSourceDefinition> {
  // Prototype-less object so source names like "__proto__" become own keys.
  const resolved: Record<string, RuntimeDataSourceDefinition> =
    Object.create(null)

  for (const [sourceName, rawEntry] of Object.entries(rawDataSources)) {
    const entry = rawEntry as RuntimeDataSourceDefinition & {
      paging?: unknown
      defaultPerPage?: unknown
      maxRecordsPerPage?: unknown
    }

    if (
      typeof entry.paging === "object" &&
      entry.paging !== null &&
      "defaultPerPage" in entry.paging &&
      "maxRecordsPerPage" in entry.paging
    ) {
      // defineConfig-produced entry: already resolved.
      resolved[sourceName] = entry as RuntimeDataSourceDefinition
      continue
    }

    const paging = resolvePaging({
      sourceName,
      adapterName:
        typeof entry.adapter === "string" ? entry.adapter : undefined,
      perSource: {
        defaultPerPage:
          typeof entry.defaultPerPage === "number"
            ? entry.defaultPerPage
            : undefined,
        maxRecordsPerPage:
          typeof entry.maxRecordsPerPage === "number"
            ? entry.maxRecordsPerPage
            : undefined,
      },
      globalDefaults,
    })

    resolved[sourceName] = { ...entry, paging }
  }

  return resolved
}

/**
 * Resolves, validates, and normalizes a LakeQL project configuration file.
 *
 * Uses c12 to locate a `lakeql.config.{ts,mts,js,mjs}` file within the
 * specified working directory. The resolved module's default export is
 * validated and normalized into a {@link LoadedLakeQLProject} containing
 * serializable data-source definitions and non-serializable adapter factories.
 *
 * This function is stateless: it maintains no module-level config state and
 * each call returns an independent result.
 *
 * @param options - Resolution options containing the working directory.
 * @returns A normalized project config with separate `config` and `adapters` fields.
 * @throws {Error} When no config file is found, the extension is unsupported,
 *   the default export is unusable, or `dataSources` is missing/invalid.
 */
export async function loadConfig(
  options: LoadConfigOptions = {}
): Promise<LoadedLakeQLProject> {
  const cwd = options.cwd ?? process.cwd()

  rejectUnsupportedCandidates(cwd)

  let configFile: string | undefined
  let config: unknown

  try {
    const result = await loadC12Config({
      name: "lakeql",
      cwd,
      packageJson: false,
      globalRc: false,
      rcFile: false,
      dotenv: false,
    })

    const { configFile: resolvedFile, config: resolvedConfig } = result

    configFile = resolvedFile ? path.resolve(cwd, resolvedFile) : undefined
    config = resolvedConfig
  } catch (error) {
    throw new Error(`Failed to resolve config file in "${cwd}".`, {
      cause: error,
    })
  }

  if (!configFile) {
    throw new Error(
      `No config file found in "${cwd}". ` +
        `Expected one of: lakeql.config.ts, lakeql.config.mts, lakeql.config.js, lakeql.config.mjs.`
    )
  }

  validateConfigExtension(configFile)

  if (config === null || config === undefined || typeof config !== "object") {
    throw new Error(
      `Config file "${configFile}" does not export a valid object. ` +
        `The default export must be a non-null object.`
    )
  }

  const configObj = config as Record<string, unknown>

  const { dataSources } = configObj

  if (
    dataSources === null ||
    dataSources === undefined ||
    typeof dataSources !== "object" ||
    Array.isArray(dataSources)
  ) {
    throw new Error(
      `Config file "${configFile}" is missing a valid "dataSources" object.`
    )
  }

  const { adapters } = configObj
  const adapterArray = resolveAdapterFactories(adapters)

  // Read config-level paging defaults with a guarded read, matching the
  // sourcePath/auth/permissions pass-through pattern.
  const configLevelPaging =
    typeof configObj.paging === "object" && configObj.paging !== null
      ? (configObj.paging as {
          defaultPerPage?: number
          maxRecordsPerPage?: number
        })
      : undefined

  // Resolve per-source paging. Entries produced by defineConfig already carry
  // a resolved paging value and are passed through untouched; hand-authored
  // entries are resolved here. The result map is built with a prototype-less
  // object (see resolveDataSourcesPaging), so source names such as
  // "__proto__" become own keys rather than mutating the prototype chain.
  const resolvedDataSources = resolveDataSourcesPaging(
    dataSources as Record<string, unknown>,
    configLevelPaging
  )

  // Pass through application-level config fields
  const sourcePath =
    typeof configObj.sourcePath === "string" ? configObj.sourcePath : "."
  const auth = configObj.auth as LoadedLakeQLProject["config"]["auth"]
  const permissions = configObj.permissions as
    | LoadedLakeQLProject["config"]["permissions"]
    | undefined

  return {
    config: {
      dataSources: resolvedDataSources,
      sourcePath,
      auth,
      permissions,
      paging: configLevelPaging,
    },
    adapters: adapterArray,
  }
}
