import type { AdapterName } from "@lakeql/datasource"

/**
 * Thrown during registry construction when two or more adapter factories
 * share the same adapter name.
 *
 * Exposes the conflicting name for programmatic handling and includes it
 * in the error message for diagnostics.
 */
export class DuplicateAdapterError extends Error {
  override readonly name = "DuplicateAdapterError"

  /** The adapter name that was registered more than once. */
  readonly adapterName: AdapterName

  /**
   * @param adapterName - The conflicting adapter name detected during
   *   registry construction.
   */
  constructor(adapterName: AdapterName) {
    super(`Duplicate adapter name: "${adapterName}"`)
    this.adapterName = adapterName
  }
}
