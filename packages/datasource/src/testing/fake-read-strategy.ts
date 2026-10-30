import type {
  DataSourceReadInput,
  DataSourceReadResult,
  DataSourceReadStrategy,
} from "../types/read"

/**
 * Minimal fake `DataSourceReadStrategy` for testing.
 *
 * Returns empty results with valid page info. Does not import
 * `@lakeql/config` or any concrete adapter package.
 */
export class FakeReadStrategy implements DataSourceReadStrategy {
  // eslint-disable-next-line class-methods-use-this
  read = async <T>(
    _input: DataSourceReadInput
  ): Promise<DataSourceReadResult<T>> => ({
    totalCount: 0,
    pageInfo: {
      maxPages: 0,
      hasNext: false,
      hasPrevious: false,
      currentPage: 1,
      nextPage: null,
      previousPage: null,
    },
    nodes: [] as T[],
  })
}
