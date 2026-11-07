/**
 * Shared factory for the CTE-based {@link ResponseNormalizer} used by SQL
 * adapters.
 *
 * Both the Trino and Fabric adapters drive the same Kysely-based
 * `generateQuery()`, which produces an identical CTE result shape: a
 * `total_records` column from the count CTE propagated to every row via a FULL
 * JOIN, and a `__lakeql_record_present` sentinel that is `null` on the synthetic
 * count-only row and truthy on real data rows. This factory owns that shared
 * decoding; adapters inject only what genuinely differs between them.
 *
 * @module
 */

import type { AdapterName } from "@lakeql/datasource"

import type {
  NormalizedResponse,
  ResponseNormalizationInput,
  ResponseNormalizer,
} from "./normalizer"

/**
 * Column name emitted by the `total_count` CTE and propagated to every result
 * row via the FULL JOIN.
 */
const TOTAL_RECORDS_KEY = "total_records"

/**
 * Sentinel column emitted by the `records` CTE. A `null` value identifies the
 * synthetic count-only row produced by the FULL JOIN when the records CTE is
 * empty; any other value is validated by the adapter-injected predicate.
 */
const RECORD_PRESENT_KEY = "__lakeql_record_present"

/**
 * Validate and extract the total count from a raw `total_records` value.
 *
 * @throws {Error} If the value is absent, non-numeric, negative, non-finite,
 *   or non-integral.
 */
function extractTotalCount(value: unknown): number {
  if (value === undefined || value === null) {
    throw new Error("Malformed count metadata: total_records is absent or null")
  }

  if (typeof value !== "number") {
    throw new TypeError(
      `Malformed count metadata: total_records must be a number, got ${typeof value}`
    )
  }

  if (!Number.isFinite(value)) {
    throw new TypeError(
      `Malformed count metadata: total_records must be finite, got ${String(value)}`
    )
  }

  if (value < 0) {
    throw new RangeError(
      `Malformed count metadata: total_records must be non-negative, got ${value}`
    )
  }

  if (!Number.isInteger(value)) {
    throw new TypeError(
      `Malformed count metadata: total_records must be an integer, got ${value}`
    )
  }

  return value
}

/**
 * Validate and convert a date-field value from seconds to milliseconds.
 *
 * @returns The value multiplied by 1000, or `null` if the input is `null`.
 * @throws {Error} If the value is non-numeric or non-finite.
 */
function convertDateValue(value: unknown, fieldName: string): unknown {
  if (value === null) {
    return null
  }

  if (typeof value !== "number") {
    throw new TypeError(
      `Invalid date field "${fieldName}": expected a finite number, got ${typeof value}`
    )
  }

  if (!Number.isFinite(value)) {
    throw new TypeError(
      `Invalid date field "${fieldName}": expected a finite number, got ${String(value)}`
    )
  }

  return value * 1000
}

/**
 * Validate that a response entry is a non-null plain object suitable for
 * property access.
 *
 * @throws {Error} If the entry is not a non-null plain object.
 */
function assertRowObject(
  entry: unknown,
  index: number,
  isPlainObject: (value: unknown) => boolean
): Record<string, unknown> {
  if (!isPlainObject(entry)) {
    throw new Error(
      `Malformed adapter response: row at index ${index} must be a non-null plain object, got ${entry === null ? "null" : typeof entry}`
    )
  }
  return entry as Record<string, unknown>
}

/**
 * Options for {@link createCteResponseNormalizer}.
 */
export interface CteResponseNormalizerOptions {
  /** Open identifier of the adapter that owns this normalizer. */
  adapterName: AdapterName
  /**
   * Predicate deciding whether a non-null sentinel value marks a real data
   * row. This is adapter-specific and MUST stay injected: Trino accepts only
   * the boolean `true`, while Fabric's TDS driver returns `1`. Widening one
   * adapter's predicate to the other's would change validation behavior.
   */
  isPresentSentinel: (value: unknown) => boolean
  /**
   * Human-readable description of the accepted sentinel values, used in the
   * error thrown for an invalid sentinel (e.g. `"true"` or `"true/1"`).
   */
  acceptedSentinelDescription: string
  /**
   * Strict plain-object guard. Injected because each adapter already ships its
   * own (identical) implementation; passing it keeps this package free of a
   * dependency on either adapter's `sql-helpers`.
   */
  isPlainObject: (value: unknown) => boolean
}

/**
 * Creates a {@link ResponseNormalizer} for the shared CTE query shape.
 *
 * The returned normalizer extracts and validates `total_records`, drops the
 * synthetic count-only row and the internal metadata columns, converts date
 * fields from seconds to milliseconds, and preserves all other values. The
 * only adapter-specific behavior is the sentinel predicate.
 *
 * @param options - Adapter name, sentinel predicate and description, and the
 *   plain-object guard.
 * @returns A normalizer implementing the neutral {@link ResponseNormalizer}.
 */
export function createCteResponseNormalizer(
  options: CteResponseNormalizerOptions
): ResponseNormalizer {
  const {
    adapterName,
    isPresentSentinel,
    acceptedSentinelDescription,
    isPlainObject,
  } = options

  return {
    adapterName,

    normalize<T>(input: ResponseNormalizationInput): NormalizedResponse<T> {
      const { response, dateFields } = input

      if (response.length === 0) {
        return { totalCount: 0, data: [] }
      }

      const firstRow = assertRowObject(response[0], 0, isPlainObject)
      const totalCount = extractTotalCount(firstRow[TOTAL_RECORDS_KEY])

      const dateFieldSet = new Set(dateFields)

      const data: T[] = []

      let rowIndex = 0
      for (const raw of response) {
        const row = assertRowObject(raw, rowIndex, isPlainObject)
        rowIndex += 1

        const sentinel = row[RECORD_PRESENT_KEY]

        // Synthetic count-only row: sentinel is exactly null.
        if (sentinel === null) {
          continue
        }

        // Real data row: the adapter's predicate decides what is acceptable.
        if (!isPresentSentinel(sentinel)) {
          throw new Error(
            `Malformed adapter response: "${RECORD_PRESENT_KEY}" must be ${acceptedSentinelDescription} for data rows or null for synthetic rows, got ${typeof sentinel === "string" ? `"${sentinel}"` : String(sentinel)}`
          )
        }

        const output: Record<string, unknown> = {}

        for (const key of Object.keys(row)) {
          if (key === TOTAL_RECORDS_KEY || key === RECORD_PRESENT_KEY) {
            continue
          }

          output[key] = dateFieldSet.has(key)
            ? convertDateValue(row[key], key)
            : row[key]
        }

        data.push(output as T)
      }

      return { totalCount, data }
    },
  }
}
