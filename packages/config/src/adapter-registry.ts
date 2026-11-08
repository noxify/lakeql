import type { AdapterFactory, AdapterName } from "@lakeql/datasource"

import { DuplicateAdapterError } from "./errors/duplicate-adapter-error"
import { UnknownAdapterError } from "./errors/unknown-adapter-error"

/**
 * Instance-local adapter-factory registry.
 *
 * Accepts an explicit list of {@link AdapterFactory} instances at construction
 * and provides deterministic, immutable lookup by adapter name. Each registry
 * instance owns its own private state; concurrent runtimes never share
 * mutable registration data.
 *
 * The registry stores and returns the exact factory references supplied by
 * the caller. It does not clone, wrap, initialize, or validate adapter-owned
 * configuration.
 */
export class AdapterRegistry {
  /** O(1) factory lookup by adapter name. */
  readonly #factories: Map<AdapterName, AdapterFactory>

  /** Registration-order name list. */
  readonly #names: readonly AdapterName[]

  /**
   * Constructs a registry from an explicit list of adapter factories.
   *
   * Duplicate adapter names are rejected before any lookup can occur.
   * The input array is defensively copied so that later mutations by the
   * caller cannot alter the registrations.
   *
   * @param factories - Adapter factories to register. Each factory's
   *   `adapterName` must be unique within the list.
   * @throws {DuplicateAdapterError} When two or more factories share the
   *   same `adapterName`.
   */
  constructor(factories: readonly AdapterFactory[]) {
    const map = new Map<AdapterName, AdapterFactory>()

    for (const factory of factories) {
      const name = factory.adapterName

      if (map.has(name)) {
        throw new DuplicateAdapterError(name)
      }

      map.set(name, factory)
    }

    this.#factories = map
    this.#names = [...map.keys()]
  }

  /**
   * Returns the factory registered under the given adapter name, or
   * `undefined` if no factory is registered for that name.
   *
   * @param adapterName - The adapter name to look up.
   * @returns The registered factory, or `undefined`.
   */
  get(adapterName: AdapterName): AdapterFactory | undefined {
    return this.#factories.get(adapterName)
  }

  /**
   * Returns the factory registered under the given adapter name.
   *
   * This is the standard runtime-composition path: callers that expect
   * the adapter to be present use this method and handle the structured
   * error at a higher level.
   *
   * @param adapterName - The adapter name to look up.
   * @returns The registered factory.
   * @throws {UnknownAdapterError} When no factory is registered for the
   *   requested name.
   */
  getOrThrow(adapterName: AdapterName): AdapterFactory {
    const factory = this.#factories.get(adapterName)

    if (factory === undefined) {
      throw new UnknownAdapterError(adapterName, this.#names)
    }

    return factory
  }

  /**
   * Returns a fresh readonly snapshot of all registered adapter names
   * in registration order.
   *
   * Mutating the returned array does not affect the registry's internal
   * state.
   *
   * @returns A new array of adapter names in the order they were registered.
   */
  list(): readonly AdapterName[] {
    return [...this.#names]
  }
}
