import type { AdapterName } from "@lakeql/datasource"

/**
 * Thrown by {@link createSqlReadStrategy} when the adapter names on the
 * data source, dialect, and normalizer are not all strictly equal.
 *
 * Exposes the three adapter name values as readonly properties so that
 * mismatch diagnosis is programmatic and does not require message parsing.
 */
export class SqlReadStrategyConfigurationError extends Error {
  /** Adapter name declared by the data source. */
  readonly dataSourceAdapter: AdapterName
  /** Adapter name declared by the query dialect. */
  readonly dialectAdapter: AdapterName
  /** Adapter name declared by the response normalizer. */
  readonly normalizerAdapter: AdapterName

  /**
   * @param dataSourceAdapter - Adapter name from the data source.
   * @param dialectAdapter - Adapter name from the query dialect.
   * @param normalizerAdapter - Adapter name from the response normalizer.
   */
  constructor(
    dataSourceAdapter: AdapterName,
    dialectAdapter: AdapterName,
    normalizerAdapter: AdapterName
  ) {
    super(
      `SqlReadStrategy adapter name mismatch: ` +
        `dataSource="${dataSourceAdapter}", ` +
        `dialect="${dialectAdapter}", ` +
        `normalizer="${normalizerAdapter}"`
    )
    this.name = "SqlReadStrategyConfigurationError"
    this.dataSourceAdapter = dataSourceAdapter
    this.dialectAdapter = dialectAdapter
    this.normalizerAdapter = normalizerAdapter
  }
}
