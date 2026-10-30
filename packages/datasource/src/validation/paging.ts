import { DataSourceValidationError } from "../errors/index"

/**
 * Default upper bound for `perPage` when no {@link ReadValidationConfig}
 * override is supplied.
 */
export const DEFAULT_MAX_PER_PAGE = 10_000

/**
 * Configuration for read-input validation.
 */
export interface ReadValidationConfig {
  /**
   * Maximum allowed `perPage` value.
   *
   * @default 10000
   */
  maxPerPage?: number
}

/**
 * Validates paging (and optional sorting) parameters before query building.
 *
 * Read-strategy implementations MUST call this before building or executing
 * any query. Invalid input throws a {@link DataSourceValidationError} to block
 * query construction.
 *
 * Rules:
 * - `page`: finite integer ≥ 1.
 * - `perPage`: finite integer between 1 and `config.maxPerPage`
 *   (default {@link DEFAULT_MAX_PER_PAGE}).
 * - `sorting` (when present): must be an array.
 *
 * @param paging - One-based page number, page size, and optional sorting.
 * @param config - Optional validation limits (e.g. `maxPerPage`).
 * @throws {DataSourceValidationError} When any value is out of range or of the
 *   wrong shape.
 */
export function validatePaging(
  paging: {
    page: number
    perPage: number
    sorting?: readonly unknown[]
  },
  config?: ReadValidationConfig
): void {
  const maxPerPage = config?.maxPerPage ?? DEFAULT_MAX_PER_PAGE

  if (!Number.isInteger(paging.page) || paging.page < 1) {
    throw new DataSourceValidationError(
      `Invalid page value: ${paging.page}. Must be a positive integer.`,
      { field: "page", value: paging.page }
    )
  }

  if (!Number.isInteger(paging.perPage) || paging.perPage < 1) {
    throw new DataSourceValidationError(
      `Invalid perPage value: ${paging.perPage}. Must be a positive integer.`,
      { field: "perPage", value: paging.perPage }
    )
  }

  if (paging.perPage > maxPerPage) {
    throw new DataSourceValidationError(
      `Invalid perPage value: ${paging.perPage}. Must not exceed ${maxPerPage}.`,
      { field: "perPage", value: paging.perPage }
    )
  }

  if (paging.sorting !== undefined && !Array.isArray(paging.sorting)) {
    throw new DataSourceValidationError(
      `Invalid sorting value: expected an array.`,
      { field: "sorting", value: paging.sorting }
    )
  }
}
