/**
 * Adapter-owned Fabric/T-SQL rendering helpers for bracket-quoted
 * identifier quoting and literal escaping. These are used by metadata
 * queries, DDL rendering, and the Fabric dialect throughout the adapter.
 *
 * @module
 */

import { quoteQualified, rejectControlChars } from "@lakeql/datasource"

export { escapeLiteral, isPlainObject } from "@lakeql/datasource"

/**
 * Quote a single SQL identifier segment for T-SQL using bracket quoting.
 *
 * The input is treated as exactly one identifier segment. Dots within the
 * value are preserved as part of the segment and are **not** interpreted as
 * qualification separators. Embedded right-bracket characters are escaped by
 * doubling them (`]` → `]]`), and the result is wrapped in brackets.
 *
 * @param segment - The raw identifier segment to quote.
 * @returns The safely bracket-quoted identifier string.
 * @throws {Error} If `segment` is empty or contains C0/C1 control characters.
 *
 * @example
 * ```ts
 * quoteIdentifier("my_table")       // => '[my_table]'
 * quoteIdentifier('has]bracket')     // => '[has]]bracket]'
 * quoteIdentifier("catalog.with.dot") // => '[catalog.with.dot]'
 * ```
 */
export function quoteIdentifier(segment: string): string {
  if (segment.length === 0) {
    throw new Error("Identifier segment must not be empty")
  }

  rejectControlChars(segment, "Identifier segment")

  return `[${segment.replaceAll("]", "]]")}]`
}

/**
 * Quote a fully-qualified T-SQL identifier composed of one or more segments.
 *
 * Applies {@link quoteIdentifier} independently to each segment and joins
 * them with literal dots. Requires at least one segment.
 *
 * @param segments - One or more raw identifier segments (e.g. catalog, schema, table).
 * @returns The safely quoted qualified identifier string.
 * @throws {Error} If no segments are provided, or if any segment is invalid.
 *
 * @example
 * ```ts
 * quoteQualifiedIdentifier("warehouse", "dbo", "orders")
 * // => '[warehouse].[dbo].[orders]'
 * ```
 */
export function quoteQualifiedIdentifier(...segments: string[]): string {
  return quoteQualified(quoteIdentifier, ...segments)
}
