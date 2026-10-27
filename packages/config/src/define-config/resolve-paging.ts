import type { ReadStrategyPaging } from "@lakeql/datasource"

import { DataSourceConfigError } from "../errors/data-source-config-error"

/**
 * Resolved per-data-source paging limits produced by {@link resolvePaging}.
 *
 * Extends {@link ReadStrategyPaging} so resolved values flow to the adapter
 * factory's `createReadStrategy` paging argument with compile-time
 * assignability and no cast. The named interface is retained (rather than a
 * type alias) so it reads as a distinct, documented config-layer type.
 */
// oxlint-disable-next-line typescript/no-empty-interface typescript/no-empty-object-type -- named config-layer alias of the shared contract
export interface ResolvedPaging extends ReadStrategyPaging {}

/**
 * Page size applied when neither the per-source nor the global config
 * supplies a `defaultPerPage`.
 */
export const SYSTEM_DEFAULT_PER_PAGE = 100

/**
 * Upper bound applied when neither the per-source nor the global config
 * supplies a `maxRecordsPerPage`.
 */
export const SYSTEM_DEFAULT_MAX_RECORDS_PER_PAGE = 2000

/**
 * Asserts that a supplied paging value is a positive integer.
 *
 * Only called for values that were actually supplied (per-source or global);
 * omitted values are never validated because they fall back to a default.
 *
 * @param value - The supplied numeric value to validate.
 * @param field - The field name being validated, for error context.
 * @param sourceName - The configured data-source name, for error context.
 * @param adapterName - The adapter name, for error context.
 * @throws {DataSourceConfigError} When `value` is not an integer `>= 1`
 *   (rejects `NaN`, non-finite, non-integer, zero, and negative values).
 */
function assertPositiveInteger(
  value: number,
  field: "defaultPerPage" | "maxRecordsPerPage",
  sourceName: string,
  adapterName: string | undefined
): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new DataSourceConfigError(
      `Data source "${sourceName}": paging field "${field}" must be a positive integer, received ${String(value)}`,
      sourceName,
      adapterName,
      new RangeError(
        `paging field "${field}" must be a positive integer, received ${String(value)}`
      )
    )
  }
}

/**
 * Resolves the effective paging limits for a single data source.
 *
 * Each field is resolved independently by precedence: a supplied per-source
 * value wins over a supplied global default, which wins over the system
 * default (`100` for `defaultPerPage`, `2000` for `maxRecordsPerPage`). Every
 * supplied value (per-source or global) is validated as a positive integer.
 * After resolution, the invariant `defaultPerPage <= maxRecordsPerPage` is
 * enforced.
 *
 * This function is pure: it reads only its arguments and returns a fresh
 * {@link ResolvedPaging} value without mutating state.
 *
 * @param args - Resolution inputs.
 * @param args.sourceName - The configured data-source name, for error context.
 * @param args.adapterName - The adapter name, for error context, or
 *   `undefined` when not yet resolved.
 * @param args.perSource - Per-source overrides; either field may be omitted.
 * @param args.globalDefaults - Config-level defaults, or `undefined`; either
 *   field may be omitted.
 * @returns The resolved paging limits.
 * @throws {DataSourceConfigError} When a supplied value is not a positive
 *   integer, or when resolved `defaultPerPage` exceeds resolved
 *   `maxRecordsPerPage` (the latter carries a `RangeError` cause).
 */
export function resolvePaging(args: {
  sourceName: string
  adapterName: string | undefined
  perSource: { defaultPerPage?: number; maxRecordsPerPage?: number }
  globalDefaults:
    | { defaultPerPage?: number; maxRecordsPerPage?: number }
    | undefined
}): ResolvedPaging {
  const { sourceName, adapterName, perSource, globalDefaults } = args

  if (perSource.defaultPerPage !== undefined) {
    assertPositiveInteger(
      perSource.defaultPerPage,
      "defaultPerPage",
      sourceName,
      adapterName
    )
  }
  if (perSource.maxRecordsPerPage !== undefined) {
    assertPositiveInteger(
      perSource.maxRecordsPerPage,
      "maxRecordsPerPage",
      sourceName,
      adapterName
    )
  }
  if (globalDefaults?.defaultPerPage !== undefined) {
    assertPositiveInteger(
      globalDefaults.defaultPerPage,
      "defaultPerPage",
      sourceName,
      adapterName
    )
  }
  if (globalDefaults?.maxRecordsPerPage !== undefined) {
    assertPositiveInteger(
      globalDefaults.maxRecordsPerPage,
      "maxRecordsPerPage",
      sourceName,
      adapterName
    )
  }

  const defaultPerPage =
    perSource.defaultPerPage ??
    globalDefaults?.defaultPerPage ??
    SYSTEM_DEFAULT_PER_PAGE
  const maxRecordsPerPage =
    perSource.maxRecordsPerPage ??
    globalDefaults?.maxRecordsPerPage ??
    SYSTEM_DEFAULT_MAX_RECORDS_PER_PAGE

  if (defaultPerPage > maxRecordsPerPage) {
    throw new DataSourceConfigError(
      `Data source "${sourceName}": resolved defaultPerPage (${String(defaultPerPage)}) exceeds resolved maxRecordsPerPage (${String(maxRecordsPerPage)})`,
      sourceName,
      adapterName,
      new RangeError(
        `resolved defaultPerPage (${String(defaultPerPage)}) exceeds resolved maxRecordsPerPage (${String(maxRecordsPerPage)})`
      )
    )
  }

  return { defaultPerPage, maxRecordsPerPage }
}
