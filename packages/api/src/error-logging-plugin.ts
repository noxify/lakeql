/**
 * Yoga plugin that logs GraphQL execution errors through the configured
 * logger, so failures remain observable in server logs even after
 * `handleErrorResponse` turns them into client-facing `GraphQLError`s (which
 * Yoga would otherwise treat as expected and not log).
 *
 * The log level is derived from the underlying {@link DataSourceError}
 * category: infrastructure failures (network, timeout) are logged at `error`,
 * expected client-facing failures (auth, query, unsupported, cancelled) at
 * `warn`, and anything that is not a `DataSourceError` at `error` (it is
 * unexpected). An optional {@link ApiErrorHook} lets the application forward
 * each error to its own telemetry (OpenTelemetry, Sentry, …) without this
 * package depending on any of them.
 *
 * @module
 */

import type { DataSourceErrorCategory } from "@lakeql/datasource"
import { DataSourceError } from "@lakeql/datasource"
import type { createLogger } from "@lakeql/logger"
import type { GraphQLError } from "graphql"
import type { Plugin } from "graphql-yoga"

/**
 * Context passed to an {@link ApiErrorHook} for each logged GraphQL error.
 */
export interface ApiErrorContext {
  /** The GraphQL error as surfaced to the client. */
  error: GraphQLError
  /** The underlying `DataSourceError`, when the failure originated from one. */
  dataSourceError?: DataSourceError
  /** The GraphQL operation name, when available. */
  operationName?: string
}

/**
 * Application hook invoked for every logged GraphQL error. Use it to forward
 * errors to external telemetry (OpenTelemetry, Sentry, metrics). Thrown errors
 * from the hook are swallowed so telemetry never breaks a response.
 */
export type ApiErrorHook = (context: ApiErrorContext) => void | Promise<void>

type Logger = ReturnType<typeof createLogger>

/** Log level for a given data-source error category. */
function levelForCategory(
  category: DataSourceErrorCategory | undefined
): "error" | "warn" {
  // Infrastructure failures are actionable operational problems.
  if (category === "network" || category === "timeout") {
    return "error"
  }
  // Expected, client-facing failures (auth/query/unsupported/cancelled) — and,
  // as a fallback, anything uncategorized — are warnings, not alerts.
  return "warn"
}

/** Extract the underlying DataSourceError from a GraphQL error, if any. */
function dataSourceErrorOf(error: GraphQLError): DataSourceError | undefined {
  const original = error.originalError
  return original instanceof DataSourceError ? original : undefined
}

/**
 * Create the error-logging plugin.
 *
 * @param logger - The configured logger.
 * @param onError - Optional application hook for external telemetry.
 * @returns A Yoga plugin that logs execution errors.
 */
export function createErrorLoggingPlugin(
  logger: Logger,
  onError?: ApiErrorHook
): Plugin {
  return {
    onExecute() {
      return {
        onExecuteDone({ result }) {
          // Streaming/incremental results are async iterables without a static
          // `errors` array; skip them here (they are rare for this API).
          if (!("errors" in result) || !result.errors?.length) {
            return
          }

          for (const error of result.errors) {
            const dsError = dataSourceErrorOf(error)
            const level = dsError ? levelForCategory(dsError.category) : "error"

            const entry = logger
              .withMetadata({
                code: (error.extensions?.code as string) ?? "UNKNOWN",
                category: dsError?.category,
                dataSource: dsError?.dataSource,
                adapter: dsError?.adapter,
                path: error.path?.join("."),
              })
              .withError(dsError ?? error)

            if (level === "error") {
              entry.error(error.message)
            } else {
              entry.warn(error.message)
            }

            if (onError) {
              void Promise.resolve(
                onError({
                  error,
                  dataSourceError: dsError,
                  operationName: undefined,
                })
              ).catch(() => {
                // Telemetry must never break the response.
              })
            }
          }
        },
      }
    },
  }
}
