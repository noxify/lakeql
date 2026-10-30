import { UnsupportedOperationError } from "./errors/unsupported-operation-error"
import type { AdapterName } from "./types/adapter"
import type {
  DataSourceWriteInput,
  DataSourceWriteStrategy,
} from "./types/write"

/**
 * A write strategy that rejects every write with an
 * {@link UnsupportedOperationError}.
 *
 * Adapter factories use this to satisfy the {@link DataSourceWriteStrategy}
 * contract when the adapter does not yet provide a real write path.
 */
export class UnsupportedWriteStrategy implements DataSourceWriteStrategy {
  readonly #adapter: AdapterName
  readonly #dataSource: string

  /**
   * @param options - Adapter and data-source identifiers attached to the
   *   rejection error.
   * @param options.adapter - Open identifier of the adapter.
   * @param options.dataSource - Runtime name of the data source.
   */
  constructor(options: { adapter: AdapterName; dataSource: string }) {
    this.#adapter = options.adapter
    this.#dataSource = options.dataSource
  }

  /**
   * Always rejects with an {@link UnsupportedOperationError}.
   *
   * The input is intentionally ignored — the strategy does not inspect,
   * destructure, validate, log, mutate, forward, or otherwise access it.
   *
   * @param _input - Write input (unused).
   * @returns A promise that rejects with an `UnsupportedOperationError`.
   */
  write(_input: DataSourceWriteInput): Promise<void> {
    return Promise.reject(
      new UnsupportedOperationError(
        `Adapter "${this.#adapter}" does not support write operations`,
        this.#adapter,
        this.#dataSource,
        "write"
      )
    )
  }
}
