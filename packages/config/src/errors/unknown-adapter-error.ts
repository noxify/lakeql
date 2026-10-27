import type { AdapterName } from "@lakeql/datasource"

/**
 * Thrown by `getOrThrow()` when the requested adapter name is not present
 * in the registry.
 *
 * Exposes the requested name and a snapshot of all registered adapter names
 * for programmatic handling and diagnostics.
 */
export class UnknownAdapterError extends Error {
  override readonly name = "UnknownAdapterError"

  /** The adapter name that was requested but not found. */
  readonly adapterName: AdapterName

  /** Immutable snapshot of registered adapter names at the time of the error. */
  readonly registeredAdapterNames: readonly AdapterName[]

  /**
   * @param adapterName - The adapter name that was not found in the registry.
   * @param registeredAdapterNames - All adapter names currently registered,
   *   in registration order. A defensive copy is stored internally.
   */
  constructor(
    adapterName: AdapterName,
    registeredAdapterNames: readonly AdapterName[]
  ) {
    const registered = [...registeredAdapterNames]
    const detail =
      registered.length === 0
        ? "no adapters are registered"
        : `registered adapters are ${registered.map((n) => `"${n}"`).join(", ")}`

    super(`Unknown adapter "${adapterName}": ${detail}`)
    this.adapterName = adapterName
    this.registeredAdapterNames = Object.freeze([...registered])
  }
}
