import type { AdapterName } from "@lakeql/datasource"

/**
 * Thrown during configuration validation when an adapter definition's
 * `adapterName` does not strictly equal its `factory.adapterName`.
 *
 * Exposes both names for programmatic handling and includes them in the
 * error message for diagnostics.
 */
export class AdapterNameMismatchError extends Error {
  override readonly name = "AdapterNameMismatchError"

  /** The adapter name declared on the definition object. */
  readonly definitionName: AdapterName

  /** The adapter name reported by the factory. */
  readonly factoryName: AdapterName

  /**
   * @param definitionName - The `adapterName` from the adapter definition.
   * @param factoryName - The `adapterName` from the adapter's factory.
   */
  constructor(definitionName: AdapterName, factoryName: AdapterName) {
    super(
      `Adapter name mismatch: definition declares "${definitionName}" but factory reports "${factoryName}"`
    )
    this.definitionName = definitionName
    this.factoryName = factoryName
  }
}
