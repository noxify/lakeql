// oxlint-disable no-await-in-loop
// Sequential iteration is required by design: close() must attempt
// every data source regardless of prior failures.

import type {
  DataSource,
  DataSourceReadStrategy,
  DataSourceWriteStrategy,
} from "@lakeql/datasource"

import { UnknownDataSourceError } from "./errors/unknown-datasource-error"
import { WriteStrategyNotConfiguredError } from "./errors/write-strategy-not-configured-error"
import type { LakeQLRuntime } from "./types"

/**
 * Internal implementation of the {@link LakeQLRuntime} interface.
 *
 * Holds the Maps of data sources, read strategies, and write strategies
 * populated during runtime composition. Accessors return the exact
 * instances from these Maps; repeated calls with the same name return
 * the identical reference. The class is not exported from the package
 * entry point — consumers interact through the `LakeQLRuntime` interface.
 */
export class LakeQLRuntimeImpl implements LakeQLRuntime {
  /** Frozen snapshot of configured source names for error reporting. */
  private readonly sourceNames: readonly string[]

  /** Promise returned by the first `close()` call; `undefined` until close is initiated. */
  private closePromise: Promise<void> | undefined

  /** Map of configured source name to data-source instance. */
  private readonly dataSources: Map<string, DataSource>

  /** Map of configured source name to read-strategy instance. */
  private readonly readStrategies: Map<string, DataSourceReadStrategy>

  /** Map of configured source name to write-strategy instance. */
  private readonly writeStrategies: Map<string, DataSourceWriteStrategy>

  /**
   * @param dataSources - Map of configured source name to data-source instance.
   * @param readStrategies - Map of configured source name to read-strategy instance.
   * @param writeStrategies - Map of configured source name to write-strategy instance.
   * @param sourceNames - Frozen snapshot of all configured source names at creation time.
   */
  constructor(
    dataSources: Map<string, DataSource>,
    readStrategies: Map<string, DataSourceReadStrategy>,
    writeStrategies: Map<string, DataSourceWriteStrategy>,
    sourceNames: readonly string[]
  ) {
    this.dataSources = dataSources
    this.readStrategies = readStrategies
    this.writeStrategies = writeStrategies
    this.sourceNames = sourceNames
  }

  /**
   * Returns the data-source instance for the given configured name.
   *
   * @param name - Configured source name.
   * @returns The data source created for this name during composition.
   * @throws {UnknownDataSourceError} When `name` is not a configured source.
   */
  getDataSource(name: string): DataSource {
    const ds = this.dataSources.get(name)
    if (ds === undefined) {
      throw new UnknownDataSourceError(name, this.sourceNames)
    }
    return ds
  }

  /**
   * Returns the read-strategy instance for the given configured name.
   *
   * @param name - Configured source name.
   * @returns The read strategy created for this name during composition.
   * @throws {UnknownDataSourceError} When `name` is not a configured source.
   */
  getReadStrategy(name: string): DataSourceReadStrategy {
    const rs = this.readStrategies.get(name)
    if (rs === undefined) {
      throw new UnknownDataSourceError(name, this.sourceNames)
    }
    return rs
  }

  /**
   * Returns the write-strategy instance for the given configured name.
   *
   * @param name - Configured source name.
   * @returns The write strategy created for this name during composition.
   * @throws {UnknownDataSourceError} When `name` is not a configured source.
   * @throws {WriteStrategyNotConfiguredError} When the source exists but has no write strategy.
   */
  getWriteStrategy(name: string): DataSourceWriteStrategy {
    if (!this.dataSources.has(name)) {
      throw new UnknownDataSourceError(name, this.sourceNames)
    }
    const ws = this.writeStrategies.get(name)
    if (ws === undefined) {
      throw new WriteStrategyNotConfiguredError(name)
    }
    return ws
  }

  /**
   * Releases all resources held by this runtime.
   *
   * Invokes `close()` on every owned data-source instance exactly once.
   * Subsequent calls return the same promise without closing data sources
   * again.
   *
   * @returns A promise that resolves when all owned data sources are closed.
   */
  close(): Promise<void> {
    if (this.closePromise !== undefined) {
      return this.closePromise
    }

    this.closePromise = (async () => {
      const errors: unknown[] = []

      for (const ds of this.dataSources.values()) {
        try {
          await ds.close()
        } catch (error) {
          errors.push(error)
        }
      }

      if (errors.length > 0) {
        throw new Error("One or more data sources failed to close", {
          cause: errors[0],
        })
      }
    })()

    return this.closePromise
  }
}
