import type { PermissionRule } from "@lakeql/config"
import type { DataSourceErrorCategory } from "@lakeql/datasource"
import { DataSourceError } from "@lakeql/datasource"
import { AuthScopeFailureType } from "@pothos/plugin-scope-auth"
import type { AuthFailure } from "@pothos/plugin-scope-auth"
import { GraphQLError } from "graphql"

export type { PermissionFields } from "./types"

/**
 * Maps a {@link DataSourceErrorCategory} to an HTTP status code.
 */
const categoryToStatus: Record<DataSourceErrorCategory, number> = {
  auth: 403,
  cancelled: 499,
  network: 502,
  query: 400,
  timeout: 504,
  unsupported: 400,
}

/**
 * Maps a {@link DataSourceErrorCategory} to a GraphQL error extension code.
 */
const categoryToCode: Record<DataSourceErrorCategory, string> = {
  auth: "PERMISSION_DENIED",
  cancelled: "CANCELLED",
  network: "NETWORK_ERROR",
  query: "QUERY_ERROR",
  timeout: "TIMEOUT",
  unsupported: "UNSUPPORTED_OPERATION",
}

/**
 * Translates a `DataSourceError` into a `GraphQLError`.
 *
 * If the error is not a `DataSourceError`, it is re-thrown as a
 * generic 500 `GraphQLError`.
 *
 * @param error - The error to handle.
 * @throws {GraphQLError} Always throws.
 */
export const handleErrorResponse = (error: unknown): never => {
  if (error instanceof DataSourceError) {
    const status = categoryToStatus[error.category] ?? 500
    const code = categoryToCode[error.category] ?? "UNKNOWN"

    throw new GraphQLError(error.message, {
      // Preserve the DataSourceError as originalError so downstream consumers
      // (e.g. the error-logging plugin) can read its category/dataSource/adapter.
      originalError: error,
      extensions: {
        code,
        dataSource: error.dataSource,
        adapter: error.adapter,
        http: { status },
      },
    })
  }

  // Non-DataSourceError: wrap as a generic internal error
  const message = error instanceof Error ? error.message : "Unknown exception"
  throw new GraphQLError(message, {
    originalError: error instanceof Error ? error : undefined,
    extensions: {
      code: "UNKNOWN",
      http: { status: 500 },
    },
  })
}

export const throwFirstError = (failure: AuthFailure) => {
  // Check if the failure has an error attached to it and re-throw it
  if ("error" in failure && failure.error) {
    throw failure.error
  }

  // Loop over any/all scopes and see if one of their children has an error to throw
  if (
    failure.kind === AuthScopeFailureType.AnyAuthScopes ||
    failure.kind === AuthScopeFailureType.AllAuthScopes
  ) {
    throw new GraphQLError("Permission denied", {
      extensions: {
        code: "PERMISSION_DENIED",
        http: {
          status: 403,
        },
      },
    })
  }
}

/** Identity helper — returns the permission rule as-is. */
const ruleIdentity = (r: PermissionRule): PermissionRule => r

/**
 * Builds a permission entry for a single data source.
 *
 * @example
 * ```ts
 * const perm = createPermission("warehouse", (rule) => [
 *   rule({ schema: "sales", tables: ["orders", "customers"] }),
 *   rule({ catalog: "hive", schema: "finance", tables: ["*"] }),
 * ])
 * // → { dataSource: "warehouse", rules: [...] }
 * ```
 *
 * @param dataSource - Runtime name of the data source.
 * @param rulesFn - Builder callback receiving a `rule` helper that creates `PermissionRule` entries.
 * @returns A permission entry with `dataSource` and `rules`.
 */
export function createPermission(
  dataSource: string,
  rulesFn: (rule: (r: PermissionRule) => PermissionRule) => PermissionRule[]
): { dataSource: string; rules: PermissionRule[] } {
  return { dataSource, rules: rulesFn(ruleIdentity) }
}
