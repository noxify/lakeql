/**
 * Thrown by `getWriteStrategy()` when the requested data source exists in
 * the runtime but was configured without a `writeConfig` field.
 *
 * Exposes the source name for programmatic handling and includes it in
 * the error message for diagnostics.
 */
export class WriteStrategyNotConfiguredError extends Error {
  override readonly name = "WriteStrategyNotConfiguredError"

  /** The configured data-source name that has no write strategy. */
  readonly sourceName: string

  /**
   * @param sourceName - The configured source name whose definition does
   *   not include a `writeConfig` field.
   */
  constructor(sourceName: string) {
    super(`Write strategy is not configured for data source "${sourceName}"`)
    this.sourceName = sourceName
  }
}
