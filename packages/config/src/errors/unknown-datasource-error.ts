/**
 * Thrown by runtime accessors (`getDataSource`, `getReadStrategy`,
 * `getWriteStrategy`) when the requested source name is not present
 * in the runtime's configured data sources.
 *
 * Exposes the requested name and a frozen snapshot of all configured
 * source names for programmatic handling and diagnostics.
 */
export class UnknownDataSourceError extends Error {
  override readonly name = "UnknownDataSourceError"

  /** The data-source name that was requested but not found. */
  readonly sourceName: string

  /**
   * Immutable snapshot of configured data-source names at the time of
   * the error. Subsequent mutations to the runtime's internal collection
   * do not affect this field.
   */
  readonly configuredSourceNames: readonly string[]

  /**
   * @param sourceName - The source name that was not found in the runtime.
   * @param configuredSourceNames - All source names configured in the
   *   runtime, in definition order. A defensive copy is frozen internally.
   */
  constructor(sourceName: string, configuredSourceNames: readonly string[]) {
    const configured = [...configuredSourceNames]
    const detail =
      configured.length === 0
        ? "no data sources are configured"
        : `configured data sources are ${configured.map((n) => `"${n}"`).join(", ")}`

    super(`Unknown data source "${sourceName}": ${detail}`)
    this.sourceName = sourceName
    this.configuredSourceNames = Object.freeze([...configured])
  }
}
