/**
 * Type-aware rendering of JavaScript values into Trino SQL literals for the
 * INSERT write strategy.
 *
 * This slice renders literals rather than using prepared statements; each
 * conversion is deliberately narrow and rejects values that cannot be
 * represented safely (NaN, Infinity, invalid dates).
 *
 * @module
 */

import { escapeLiteral } from "./sql-helpers"

/**
 * Renders a single value as a Trino SQL literal.
 *
 * - `null`/`undefined` → `NULL`
 * - `string` → single-quoted, quote-escaped literal
 * - `boolean` → `TRUE` / `FALSE`
 * - `number` → numeric literal; `NaN`/`Infinity` are rejected
 * - `bigint` → decimal literal
 * - `Date` → `TIMESTAMP '...'` (millisecond precision); invalid dates rejected
 *
 * @param value - The value to render.
 * @param column - Column name used only for error context.
 * @returns The Trino SQL literal.
 * @throws {Error} When the value cannot be safely represented.
 */
export function renderValue(value: unknown, column: string): string {
  if (value === null || value === undefined) {
    return "NULL"
  }

  switch (typeof value) {
    case "string": {
      return escapeLiteral(value)
    }
    case "boolean": {
      return value ? "TRUE" : "FALSE"
    }
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError(
          `Cannot render non-finite number for column "${column}": ${String(value)}`
        )
      }
      return String(value)
    }
    case "bigint": {
      return value.toString()
    }
    case "object": {
      if (value instanceof Date) {
        return renderDate(value, column)
      }
      throw new TypeError(
        `Cannot render value for column "${column}": unsupported object type`
      )
    }
    default: {
      throw new TypeError(
        `Cannot render value for column "${column}": unsupported type "${typeof value}"`
      )
    }
  }
}

/**
 * Renders a `Date` as a Trino `TIMESTAMP` literal with millisecond precision.
 */
function renderDate(value: Date, column: string): string {
  const time = value.getTime()
  if (Number.isNaN(time)) {
    throw new TypeError(`Cannot render invalid Date for column "${column}"`)
  }
  // "YYYY-MM-DD HH:MM:SS.mmm" in UTC — Trino parses this as a TIMESTAMP.
  const iso = value.toISOString().replace("T", " ").replace("Z", "")
  return `TIMESTAMP '${iso}'`
}

/**
 * Renders one record as a parenthesized `VALUES` tuple, in the given column
 * order.
 *
 * @param record - The source record.
 * @param columnNames - Ordered column names to emit.
 * @returns A `(v1, v2, ...)` literal tuple.
 */
export function renderRow(
  record: Record<string, unknown>,
  columnNames: readonly string[]
): string {
  const rendered = columnNames.map((name) => renderValue(record[name], name))
  return `(${rendered.join(", ")})`
}

/**
 * Renders multiple records as a comma-separated `VALUES` clause body.
 *
 * @param records - The source records (one batch).
 * @param columnNames - Ordered column names to emit.
 * @returns A string like `(...), (...), ...` suitable after `VALUES`.
 */
export function renderValuesClause(
  records: readonly Record<string, unknown>[],
  columnNames: readonly string[]
): string {
  return records.map((record) => renderRow(record, columnNames)).join(", ")
}
