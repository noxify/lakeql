import { AdapterNameMismatchError } from "../errors/adapter-name-mismatch-error"
import { DuplicateAdapterError } from "../errors/duplicate-adapter-error"

/**
 * Validates the adapter registration list after top-level input validation
 * has confirmed that `adapters` is a non-empty array of non-null objects.
 *
 * For each adapter in registration order:
 * 1. Checks that `adapterName` is a non-empty string.
 * 2. Checks that `adapterName === factory.adapterName`.
 * 3. Checks that no previously seen adapter shares the same name.
 *
 * Processing stops at the first error encountered.
 *
 * @param adapters - The adapter definitions array, already validated as
 *   a non-empty array of non-null objects by `validateInput`.
 * @throws {TypeError} When an adapter's `adapterName` is missing or empty.
 * @throws {AdapterNameMismatchError} When `adapterName !== factory.adapterName`.
 * @throws {DuplicateAdapterError} When two adapters share the same name.
 */
export function validateAdapters(
  adapters: readonly Record<string, unknown>[]
): void {
  const seen = new Set<string>()

  for (const adapter of adapters) {
    const { adapterName } = adapter

    // 1. Non-empty string check
    if (typeof adapterName !== "string" || adapterName === "") {
      throw new TypeError(
        "defineConfig: adapter 'adapterName' must be a non-empty string"
      )
    }

    // 2. Name/factory agreement check
    const { factory } = adapter as { factory?: Record<string, unknown> }
    const factoryName = factory?.adapterName

    if (adapterName !== factoryName) {
      throw new AdapterNameMismatchError(adapterName, String(factoryName ?? ""))
    }

    // 3. Uniqueness check
    if (seen.has(adapterName)) {
      throw new DuplicateAdapterError(adapterName)
    }

    seen.add(adapterName)
  }
}
