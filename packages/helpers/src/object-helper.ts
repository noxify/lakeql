/**
 * Returns `true` if `value` is a non-null plain object: its prototype is
 * `Object.prototype` or `null`, and it is not an array.
 *
 * This strict variant rejects class instances, `Date`, `RegExp`, and other
 * exotic objects, and is safe for prototype-less objects created via
 * `Object.create(null)` (which the previous `constructor.name` check threw on).
 *
 * @param obj - The value to test.
 * @returns `true` if `obj` is a plain object, otherwise `false`.
 */
export const isObject = (obj: unknown): obj is Record<string, unknown> => {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return false
  }
  const proto = Object.getPrototypeOf(obj) as unknown
  return proto === Object.prototype || proto === null
}
