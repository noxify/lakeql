/**
 * Plain-serializable record detection for the default merge path.
 *
 * A value is plain-serializable when it is composed recursively only of:
 * - `null`
 * - strings
 * - finite numbers (rejects `NaN`, `Infinity`, `-Infinity`)
 * - booleans
 * - arrays (whose elements are all plain-serializable)
 * - objects whose prototype is `Object.prototype` or `null`
 *   (and whose values are all plain-serializable)
 *
 * Everything else is opaque: functions, symbols, `undefined`, `Date`, `Map`,
 * `Set`, class instances (custom prototype), `NaN`, `Infinity`, `-Infinity`.
 */

/**
 * Finds the dotted field path to the first opaque (non-plain-serializable)
 * value within `value`. Returns `undefined` when the entire value is
 * plain-serializable.
 *
 * Used in error messages to identify which field contains the opaque value
 * that prevents the default merge from proceeding.
 *
 * @param value - The value to inspect.
 * @param prefix - Optional dotted path prefix for nested inspection.
 * @returns The dotted path to the first opaque value, or `undefined`.
 */
export function findOpaqueFieldPath(
  value: unknown,
  prefix?: string
): string | undefined {
  return findOpaque(value, prefix ?? "")
}

function findOpaque(value: unknown, path: string): string | undefined {
  if (value === null) {
    return undefined
  }

  switch (typeof value) {
    case "string":
    case "boolean": {
      return undefined
    }
    case "number": {
      return Number.isFinite(value) ? undefined : path || "(root)"
    }
    case "object": {
      return findOpaqueInObjectOrArray(value as object, path)
    }
    default: {
      // function, symbol, undefined, bigint
      return path || "(root)"
    }
  }
}

function findOpaqueInObjectOrArray(
  value: object,
  path: string
): string | undefined {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const childPath = path ? `${path}[${i}]` : `[${i}]`
      const result = findOpaque(value[i], childPath)
      if (result !== undefined) {
        return result
      }
    }
    return undefined
  }

  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    return path || "(root)"
  }

  const keys = Object.keys(value)
  for (const key of keys) {
    const childPath = path ? `${path}.${key}` : key
    const result = findOpaque(
      (value as Record<string, unknown>)[key],
      childPath
    )
    if (result !== undefined) {
      return result
    }
  }
  return undefined
}
