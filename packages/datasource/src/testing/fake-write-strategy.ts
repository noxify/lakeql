import type {
  DataSourceWriteInput,
  DataSourceWriteStrategy,
} from "../types/write"

/**
 * Minimal fake write strategy for testing.
 * Simulates a direct-insert write without importing `@lakeql/storage`.
 */
export class FakeWriteStrategy implements DataSourceWriteStrategy {
  /** Record batches received through {@link write}, in call order. */
  readonly writtenRecords: Record<string, unknown>[][] = []

  /** Records the input batch without writing it to an external system. */
  write = async (input: DataSourceWriteInput): Promise<void> => {
    this.writtenRecords.push(input.records)
  }
}
