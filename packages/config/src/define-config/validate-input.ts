/**
 * Top-level input validation for `defineConfig()`.
 *
 * Ensures the raw input object has the correct structural shape before
 * adapter registration and data-source processing begin. Throws `TypeError`
 * for structurally malformed input so that downstream logic can safely
 * assume the presence and correct types of `adapters` and `dataSources`.
 *
 * An empty `adapters` array is allowed: it represents a valid "empty but
 * runnable" config with no adapters and no data sources yet. Data-source
 * entries still require a matching registered adapter (enforced by typing and,
 * at runtime, by `UnknownAdapterError`).
 *
 * @param config - The raw, untyped input to `defineConfig()`.
 * @throws {TypeError} When `adapters` is missing or not an array; when any
 *   adapter entry is null or not an object; when `dataSources` is missing,
 *   null, not an object, an array, or has a non-plain prototype.
 */
export function validateInput(config: unknown): void {
  if (
    config === null ||
    config === undefined ||
    typeof config !== "object" ||
    Array.isArray(config)
  ) {
    throw new TypeError("defineConfig: config must be a non-null object")
  }

  const { adapters, dataSources } = config as Record<string, unknown>

  // --- adapters ---

  if (!Array.isArray(adapters)) {
    throw new TypeError(
      "defineConfig: 'adapters' must be an array of AdapterDefinition objects"
    )
  }

  // An empty adapters array is valid — an "empty but runnable" config. Each
  // entry that IS present must still be a non-null object.
  for (let i = 0; i < adapters.length; i += 1) {
    const entry = adapters[i]
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(
        `defineConfig: adapters[${String(i)}] must be a non-null object`
      )
    }
  }

  // --- dataSources ---

  if (dataSources === null || dataSources === undefined) {
    throw new TypeError(
      "defineConfig: 'dataSources' must be a non-null plain-object record"
    )
  }

  if (typeof dataSources !== "object") {
    throw new TypeError(
      "defineConfig: 'dataSources' must be a non-null plain-object record"
    )
  }

  if (Array.isArray(dataSources)) {
    throw new TypeError(
      "defineConfig: 'dataSources' must be a plain-object record, not an array"
    )
  }

  if (!isPlainObjectRecord(dataSources)) {
    throw new TypeError(
      "defineConfig: 'dataSources' must be a plain-object record (prototype must be Object.prototype or null)"
    )
  }
}

/**
 * Determines whether a value is a plain-object record whose prototype is
 * `Object.prototype` or `null`.
 *
 * Arrays, Date, Map, Set, class instances with custom prototypes, and other
 * exotic objects are rejected.
 */
function isPlainObjectRecord(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}
