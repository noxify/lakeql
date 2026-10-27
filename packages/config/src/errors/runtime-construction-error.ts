import type { AdapterName } from "@lakeql/datasource"

/**
 * Thrown during runtime composition when a factory method
 * (`createDataSource`, `createReadStrategy`, or `createWriteStrategy`)
 * fails for a configured data-source definition.
 *
 * Exposes the source name, adapter name, and original error for
 * programmatic handling and diagnostics.
 */
export class RuntimeConstructionError extends Error {
  override readonly name = "RuntimeConstructionError"

  /** The configured data-source name that failed during composition. */
  readonly sourceName: string

  /** The adapter name associated with the failing factory. */
  readonly adapterName: AdapterName

  /** The original error thrown by the factory method. */
  override readonly cause: unknown

  /**
   * @param sourceName - The configured data-source name that triggered the
   *   failure during runtime composition.
   * @param adapterName - The adapter name whose factory method threw.
   * @param cause - The original error thrown by the factory method.
   */
  constructor(sourceName: string, adapterName: AdapterName, cause: unknown) {
    super(
      `Runtime construction failed for source "${sourceName}" using adapter "${adapterName}"`,
      { cause }
    )
    this.sourceName = sourceName
    this.adapterName = adapterName
    this.cause = cause
  }
}
