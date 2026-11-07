/**
 * Thrown during `defineConfig()` processing when a named data source fails
 * validation, merge, adapter resolution, or opaque-value detection.
 *
 * Carries the affected source name, the optional adapter name, and the
 * original cause for programmatic handling and diagnostics. The `cause`
 * value is preserved unchanged — non-Error values (strings, `null`,
 * `undefined`, numbers, symbols) are never normalized or coerced.
 */
export class DataSourceConfigError extends Error {
  override readonly name = "DataSourceConfigError"

  /** The configured data-source name that triggered the failure. */
  readonly sourceName: string

  /**
   * The adapter name associated with the failing data source, or `undefined`
   * when the adapter could not be resolved (e.g. unknown adapter reference).
   */
  readonly adapterName: string | undefined

  /** The original thrown value that caused this configuration failure. */
  override readonly cause: unknown

  /**
   * @param message - A human-readable description of the configuration failure.
   * @param sourceName - The data-source name that triggered the failure.
   * @param adapterName - The adapter name for the failing source, or
   *   `undefined` when the adapter could not be resolved.
   * @param cause - The original thrown value. Preserved as-is without
   *   normalization or coercion.
   */
  constructor(
    message: string,
    sourceName: string,
    adapterName: string | undefined,
    cause: unknown
  ) {
    super(message, { cause })
    this.sourceName = sourceName
    this.adapterName = adapterName
    this.cause = cause
  }
}
