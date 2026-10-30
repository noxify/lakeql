import type {
  DataSource,
  DataSourceReadInput,
  DataSourceReadResult,
  DataSourceReadStrategy,
  ReadValidationConfig,
  ResolveAuth,
} from "@lakeql/datasource"
import { DataSourceValidationError, validatePaging } from "@lakeql/datasource"
import { calculatePageInfo } from "@lakeql/helpers/calculate-page-info"
import type { QueryDialect } from "@lakeql/query-builder"
import { generateQuery } from "@lakeql/query-builder"
import type {
  ResponseNormalizationInput,
  ResponseNormalizer,
  TransformSchema,
} from "@lakeql/response-transformer"
import { transformRecords } from "@lakeql/response-transformer"

import { SqlReadStrategyConfigurationError } from "./configuration-error"

/**
 * Fallback page size used when neither the read input nor the injected
 * {@link SqlReadStrategyConfig.defaultPerPage} supplies a `perPage`.
 *
 * This deliberately duplicates `@lakeql/config`'s `SYSTEM_DEFAULT_PER_PAGE`
 * value for the unwired-strategy case (a strategy constructed without a
 * resolved paging config) and lives here to avoid an inverted cross-package
 * import from the read strategy into the config package.
 */
const SQL_READ_DEFAULT_PER_PAGE = 100

/**
 * Configuration accepted by {@link createSqlReadStrategy}.
 *
 * Carries the adapter-neutral data source, auth resolution function,
 * backend-specific query dialect, and backend-specific response
 * normalizer. All three adapter-name–carrying fields must agree.
 */
export interface SqlReadStrategyConfig {
  /** Data source used for query execution. */
  dataSource: DataSource
  /** Auth resolution function for request-scoped credentials. */
  resolveAuth: ResolveAuth
  /** Adapter-specific Kysely-based query dialect. */
  dialect: QueryDialect
  /** Adapter-specific response normalizer. */
  normalizer: ResponseNormalizer
  /** Optional read-input validation limits (e.g. `maxPerPage`). */
  readValidation?: ReadValidationConfig
  /**
   * Page size applied when a read input omits `perPage`. Falls back to
   * {@link SQL_READ_DEFAULT_PER_PAGE} when this is also absent.
   */
  defaultPerPage?: number
}

/**
 * Creates a shared SQL read strategy from adapter-injected dependencies.
 *
 * Validates that the adapter names on the data source, dialect, and
 * normalizer are strictly equal. Throws
 * {@link SqlReadStrategyConfigurationError} on mismatch.
 *
 * The strategy uses the Kysely-based query builder to generate SQL from
 * the injected dialect and then passes raw response rows through the
 * injected normalizer.
 *
 * @param config - Data source, auth resolver, dialect, and normalizer.
 * @returns A fully initialized {@link DataSourceReadStrategy}.
 * @throws {SqlReadStrategyConfigurationError} When adapter names do not all match.
 */
export function createSqlReadStrategy(
  config: SqlReadStrategyConfig
): DataSourceReadStrategy {
  const {
    dataSource,
    resolveAuth,
    dialect,
    normalizer,
    readValidation,
    defaultPerPage,
  } = config

  if (
    dataSource.adapter !== dialect.adapterName ||
    dataSource.adapter !== normalizer.adapterName
  ) {
    throw new SqlReadStrategyConfigurationError(
      dataSource.adapter,
      dialect.adapterName,
      normalizer.adapterName
    )
  }

  return {
    async read<T>(
      input: DataSourceReadInput
    ): Promise<DataSourceReadResult<T>> {
      const { page } = input.paging
      const perPage =
        input.paging.perPage ?? defaultPerPage ?? SQL_READ_DEFAULT_PER_PAGE

      // 1. Validate paging (and sorting shape) before any query construction
      validatePaging({ page, perPage, sorting: input.sorting }, readValidation)

      // 1b. Warn (do not fail) on unexpected filter shapes; filter structures
      //     are adapter- and API-specific and may legitimately vary.
      warnOnUnexpectedFilter(input.filter)

      // 2. Reject adapter mismatch at read time
      if (input.sourceConfig.adapter !== dataSource.adapter) {
        throw new DataSourceValidationError(
          `Source config adapter "${input.sourceConfig.adapter}" does not match ` +
            `bound data source adapter "${dataSource.adapter}"`,
          { field: "adapter", value: input.sourceConfig.adapter }
        )
      }

      // 3. Derive limit and offset from paging; normalize null offset to 0
      const { limit, offset: rawOffset } = calculatePageInfo({
        totalCount: 0,
        page,
        perPage,
      })
      const offset = rawOffset ?? 0

      // 4. Build the SQL query via the Kysely-based query builder with injected dialect
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const compiled = generateQuery<any>({
        dialect,
        catalog: input.sourceConfig.catalog,
        schema: input.sourceConfig.schema,
        table: input.sourceConfig.tableName,
        selectFields: [...input.selectFields],
        userQuery: (input.filter ?? {}) as Record<string, unknown>,
        sorting: input.sorting as {
          field: string
          direction: "asc" | "desc"
        }[],
        paging: { limit, offset },
        transformFields: input.transformFields
          ? Object.fromEntries(Object.entries(input.transformFields))
          : undefined,
        dateFields: [...input.dateFields],
      })

      const { sql } = compiled

      // 5. Resolve request auth
      const { requestAuth, options } = await resolveAuth(
        input.sourceConfig.dataSource,
        input.context
      )

      // 6. Execute the query
      const rows = await dataSource.query({ sql, requestAuth, options })

      // 7. Normalize the response
      const normalizationInput: ResponseNormalizationInput = {
        response: rows,
        selectFields: input.selectFields,
        transformFields: input.transformFields,
        dateFields: input.dateFields,
        schema: input.schema,
      }
      const normalized =
        normalizer.normalize<Record<string, unknown>>(normalizationInput)

      // 7b. Apply schema-aware transformation to the keyed records.
      // transformFields maps source field names to result aliases; the
      // transformer applies it at every schema level (nested fields that
      // SQL aliases cannot reach).
      const transformed = transformRecords({
        records: normalized.data,
        schema: input.schema as TransformSchema,
        fieldMapping: input.transformFields,
      })

      // 8. Construct final pageInfo from actual totalCount
      const finalPageInfo = calculatePageInfo({
        totalCount: normalized.totalCount,
        page,
        perPage,
      })

      // 9. Map to DataSourceReadResult
      return {
        totalCount: normalized.totalCount,
        pageInfo: {
          maxPages: finalPageInfo.maxPages,
          hasNext: finalPageInfo.hasNext,
          hasPrevious: finalPageInfo.hasPrevious,
          currentPage: finalPageInfo.currentPage,
          nextPage: finalPageInfo.nextPage,
          previousPage: finalPageInfo.previousPage,
        },
        nodes: transformed as T[],
      }
    },
  }
}

/**
 * Emits a one-off warning when a read filter is neither absent nor a plain
 * object. Filter shapes are adapter- and API-specific, so an unexpected shape
 * is reported but not treated as a hard failure.
 *
 * @param filter - The read input filter to inspect.
 */
function warnOnUnexpectedFilter(filter: unknown): void {
  if (filter === undefined || filter === null) {
    return
  }
  if (typeof filter === "object" && !Array.isArray(filter)) {
    return
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[sql-read-strategy] Unexpected filter shape: expected an object, received ${
      Array.isArray(filter) ? "array" : typeof filter
    }. The filter will be forwarded to the query builder as-is.`
  )
}
