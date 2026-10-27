import type { AdapterFactory } from "../types/adapter-factory"
import type { ResolveAuth } from "../types/auth"
import type { DataSource } from "../types/datasource"
import type {
  DataSourceReadInput,
  DataSourceReadResult,
  DataSourceReadStrategy,
  ReadStrategyPaging,
} from "../types/read"
import type {
  DataSourceWriteInput,
  DataSourceWriteStrategy,
} from "../types/write"
import { FakeDataSource } from "./fake-datasource"

/**
 * Minimal fake `AdapterFactory` for testing.
 *
 * Proves that a third-party adapter can implement the factory contract
 * without importing `@lakeql/config` or any concrete adapter package.
 */
export class FakeAdapterFactory implements AdapterFactory {
  readonly adapterName = "fake"

  // eslint-disable-next-line class-methods-use-this
  createDataSource(_config: unknown, _name: string): DataSource {
    return new FakeDataSource()
  }

  // eslint-disable-next-line class-methods-use-this
  createReadStrategy(_args: {
    dataSource: DataSource
    resolveAuth: ResolveAuth
    paging?: ReadStrategyPaging
  }): DataSourceReadStrategy {
    return {
      read: async <T>(
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
        nodes: [],
      }),
    }
  }

  // eslint-disable-next-line class-methods-use-this
  createWriteStrategy(_args: {
    dataSource: DataSource
    dataSourceName: string
    writeConfig: unknown
  }): DataSourceWriteStrategy {
    return {
      write: async (_input: DataSourceWriteInput): Promise<void> => {
        // no-op for testing
      },
    }
  }
}
