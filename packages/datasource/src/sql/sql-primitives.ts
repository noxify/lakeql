/**
 * Adapter-neutral SQL rendering primitives shared across LakeQL adapters.
 *
 * These helpers own the escaping and validation semantics that every adapter
 * must apply identically: control-character rejection, single-quote literal
 * escaping, qualified-identifier joining, and strict plain-object detection.
 * Dialect-specific identifier quoting (double-quote vs bracket doubling) stays
 * per-adapter and is injected into {@link quoteQualified}.
 *
 * @module
 */

/**
 * Regex matching C0 control characters (U+0000–U+001F) and
 * C1 control characters (U+007F–U+009F).
 */
// oxlint-disable-next-line no-control-regex -- intentional control character detection
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F-\u009F]/u

/**
 * Throws if `value` contains any C0 (U+0000–U+001F) or C1 (U+007F–U+009F)
 * control character.
 *
 * @param value - The raw string to validate.
 * @param context - Human-readable label used in the thrown error message.
 * @throws {Error} If `value` contains a C0 or C1 control character.
 */
export function rejectControlChars(value: string, context: string): void {
  if (CONTROL_CHAR_RE.test(value)) {
    throw new Error(
      `${context} must not contain control characters (C0 U+0000–U+001F or C1 U+007F–U+009F)`
    )
  }
}

/**
 * Escape a value as a SQL string literal.
 *
 * The input is treated as a string literal value. Embedded single-quote
 * characters are escaped by doubling them (`'` → `''`), and the result is
 * wrapped in single quotes. The escaping is identical across the Trino and
 * Fabric dialects.
 *
 * @param value - The raw string value to escape.
 * @returns The safely single-quoted literal string.
 * @throws {Error} If `value` contains C0/C1 control characters.
 *
 * @example
 * ```ts
 * escapeLiteral("hello")           // => "'hello'"
 * escapeLiteral("it's")            // => "'it''s'"
 * escapeLiteral("schema'name")     // => "'schema''name'"
 * ```
 */
export function escapeLiteral(value: string): string {
  rejectControlChars(value, "String literal")

  return `'${value.replaceAll("'", "''")}'`
}

/**
 * Quote a fully-qualified identifier composed of one or more segments.
 *
 * Applies the dialect-specific `quoteFn` independently to each segment and
 * joins them with literal dots. Requires at least one segment. The per-segment
 * quoting semantics are owned by the caller's `quoteFn`.
 *
 * @param quoteFn - Dialect-specific single-segment quoter (e.g. double-quote or bracket).
 * @param segments - One or more raw identifier segments (e.g. catalog, schema, table).
 * @returns The safely quoted qualified identifier string.
 * @throws {Error} If no segments are provided, or if any segment is invalid per `quoteFn`.
 *
 * @example
 * ```ts
 * quoteQualified(quoteIdentifier, "iceberg", "public", "orders")
 * // => '"iceberg"."public"."orders"'  (with a double-quote quoteFn)
 * ```
 */
export function quoteQualified(
  quoteFn: (segment: string) => string,
  ...segments: string[]
): string {
  if (segments.length === 0) {
    throw new Error("quoteQualified requires at least one segment")
  }

  return segments.map(quoteFn).join(".")
}

/**
 * Returns `true` if `value` is a non-null plain object: its prototype is
 * `Object.prototype` or `null`, and it is not an array.
 *
 * This is the strict variant shared across all adapter modules. It rejects
 * class instances, Date, RegExp, and other exotic objects, and it is safe for
 * prototype-less objects created via `Object.create(null)`.
 *
 * @param value - The value to test.
 * @returns `true` if `value` is a plain object, otherwise `false`.
 */
export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}
