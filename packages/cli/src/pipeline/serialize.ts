/**
 * Deterministic JSON serializer that produces byte-identical output
 * for the same logical input regardless of key insertion order.
 *
 * Output guarantees:
 * - Recursively sorted keys (lexicographic) at all nesting levels
 * - 2-space indentation
 * - LF line endings exclusively (no \r\n)
 * - Single trailing newline character
 */

/**
 * Recursively sorts all object keys in a value at every nesting level.
 * Arrays preserve element order but objects within arrays are also sorted.
 */
function deepSortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(deepSortKeys)
  }

  const sorted: Record<string, unknown> = {}
  const keys = Object.keys(value as Record<string, unknown>).toSorted()

  for (const key of keys) {
    sorted[key] = deepSortKeys((value as Record<string, unknown>)[key])
  }

  return sorted
}

/**
 * Produces deterministic JSON with:
 * - Recursively sorted keys at all levels (lexicographic order)
 * - 2-space indentation
 * - LF (`\n`) line endings exclusively (no `\r\n`)
 * - Single trailing newline character
 */
export function serializeDeterministic(value: unknown): string {
  const sorted = deepSortKeys(value)
  const json = JSON.stringify(sorted, null, 2)

  // Ensure LF line endings (replace any \r\n with \n)
  const normalized = json.replaceAll("\r\n", "\n")

  // Add single trailing newline
  return `${normalized}\n`
}
