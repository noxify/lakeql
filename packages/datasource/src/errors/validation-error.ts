/**
 * Validation error for core contract values.
 *
 * Identifies the invalid field and value when the validation logic can
 * reasonably determine them. Field identification is optional.
 */
export class DataSourceValidationError extends Error {
  /** Name of the invalid field, when validation can identify one. */
  readonly field?: string
  /** Invalid value, when validation can safely expose it. */
  readonly value?: unknown

  /**
   * @param message - Human-readable explanation of the invalid value.
   * @param options - Optional field, value, and lower-level cause metadata.
   */
  constructor(
    message: string,
    options?: { field?: string; value?: unknown; cause?: unknown }
  ) {
    super(message, { cause: options?.cause })
    this.name = "DataSourceValidationError"
    this.field = options?.field
    this.value = options?.value
  }
}
