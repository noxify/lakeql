import { DataSourceConfigError } from "../errors/data-source-config-error"
import { findOpaqueFieldPath } from "./is-plain-serializable"

/**
 * Returns `true` when `value` is a non-null, non-array object with prototype
 * `Object.prototype` or `null` — i.e. a plain-object record suitable for
 * shallow spreading.
 */
function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Describes a value's type for error messages.
 */
function describeValue(value: unknown): string {
  if (value === null) {
    return "null"
  }
  if (Array.isArray(value)) {
    return "an array"
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
      const ctorName =
        (proto as { constructor?: { name?: string } }).constructor?.name ??
        "unknown"
      return `an instance of ${ctorName}`
    }
  }
  return `${typeof value} (${String(value)})`
}

/**
 * Performs the default shallow-merge of `registrationOptions`, `connection`,
 * and `overrides` for a data source when its adapter does not declare a
 * custom `mergeDataSourceConfig()` function.
 *
 * Merge precedence: `registrationOptions` -> `connection` -> `overrides`.
 * Later top-level fields replace earlier fields without recursing into nested
 * values. `writeConfig` passes through unchanged.
 *
 * Throws `DataSourceConfigError` if any merge input is not a plain-object
 * record, or if any merge input contains an opaque (non-plain-serializable)
 * nested value.
 *
 * @param sourceName - The configured data-source name (for error reporting).
 * @param adapterName - The adapter name associated with this data source.
 * @param registrationOptions - Adapter-level default options, or `undefined`.
 * @param connection - The data-source connection value.
 * @param overrides - Data-source-specific overrides, or `undefined`.
 * @param writeConfig - Optional write configuration passed through unchanged.
 * @returns The merged connection and pass-through writeConfig.
 * @throws {DataSourceConfigError} When a merge input is not a plain-object
 *   record or contains an opaque value.
 */
export function defaultMerge(
  sourceName: string,
  adapterName: string,
  registrationOptions: unknown,
  connection: unknown,
  overrides: unknown,
  writeConfig: unknown
): { connection: unknown; writeConfig?: unknown } {
  const effectiveRegistrationOptions =
    registrationOptions === undefined ? {} : registrationOptions
  const effectiveOverrides = overrides === undefined ? {} : overrides

  assertPlainObjectRecord(
    effectiveRegistrationOptions,
    "registrationOptions",
    sourceName,
    adapterName
  )
  assertPlainObjectRecord(connection, "connection", sourceName, adapterName)
  assertPlainObjectRecord(
    effectiveOverrides,
    "overrides",
    sourceName,
    adapterName
  )

  assertPlainSerializable(
    effectiveRegistrationOptions,
    "registrationOptions",
    sourceName,
    adapterName
  )
  assertPlainSerializable(connection, "connection", sourceName, adapterName)
  assertPlainSerializable(
    effectiveOverrides,
    "overrides",
    sourceName,
    adapterName
  )

  const mergedConnection = {
    ...(effectiveRegistrationOptions as Record<string, unknown>),
    ...(connection as Record<string, unknown>),
    ...(effectiveOverrides as Record<string, unknown>),
  }

  return writeConfig === undefined
    ? { connection: mergedConnection }
    : { connection: mergedConnection, writeConfig }
}

/**
 * Asserts that a value is a plain-object record (non-null, non-array object
 * with prototype `Object.prototype` or `null`). Throws a
 * `DataSourceConfigError` with a `TypeError` cause if not.
 */
function assertPlainObjectRecord(
  value: unknown,
  fieldLabel: string,
  sourceName: string,
  adapterName: string
): void {
  if (!isPlainObjectRecord(value)) {
    throw new DataSourceConfigError(
      `Data source "${sourceName}": "${fieldLabel}" must be a plain-object record for the default merge path, but received ${describeValue(value)}`,
      sourceName,
      adapterName,
      new TypeError(
        `"${fieldLabel}" must be a non-null plain-object record, got ${typeof value}`
      )
    )
  }
}

/**
 * Asserts that a value is plain-serializable, throwing a
 * `DataSourceConfigError` with a `TypeError` cause if it is not.
 */
function assertPlainSerializable(
  value: unknown,
  fieldLabel: string,
  sourceName: string,
  adapterName: string
): void {
  const opaquePath = findOpaqueFieldPath(value)
  if (opaquePath !== undefined) {
    const qualifiedPath =
      opaquePath === "(root)" ? fieldLabel : `${fieldLabel}.${opaquePath}`
    throw new DataSourceConfigError(
      `Data source "${sourceName}" contains an opaque value at "${qualifiedPath}" that cannot be shallow-merged. ` +
        `Provide a mergeDataSourceConfig() function in the adapter definition to handle opaque values.`,
      sourceName,
      adapterName,
      new TypeError(`"${qualifiedPath}" is not a plain-serializable value`)
    )
  }
}
