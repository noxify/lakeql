import { swap } from "@lakeql/helpers/object-helper"
import { error } from "@lakeql/logger/console"
import { convertTrinoResponse, transform } from "@lakeql/response-transformer"
import { AuthScopeFailureType } from "@pothos/plugin-scope-auth"
import type { AuthFailure } from "@pothos/plugin-scope-auth"
import { GraphQLError } from "graphql"
import type { JSONSchema7 } from "json-schema"

import type {
  ErrorMessage,
  TrinoArrayResponse,
  WrappedTrinoResponse,
} from "./types"

export interface SchemaConfigEntry {
  catalog: string
  schema: string
  tableName: string
}

export type TablesForCatalogAndSchema<
  TConfig extends SchemaConfigEntry,
  C extends TConfig["catalog"],
  S extends Extract<TConfig, { catalog: C }>["schema"],
> = Extract<
  TConfig,
  {
    catalog: C
    schema: S
  }
>["tableName"]

export type PermissionTableName<
  TConfig extends SchemaConfigEntry,
  C extends TConfig["catalog"],
  S extends Extract<TConfig, { catalog: C }>["schema"],
> = TablesForCatalogAndSchema<TConfig, C, S> | "*"

export const handleErrorResponse = ({
  errorMessage,
}: {
  errorMessage: ErrorMessage
}) => {
  const errorCode = errorMessage.errorCode ?? -1

  const additionalInformation = errorMessage.additionalInformation ?? []
  let message: string
  let code: string
  let status: number

  switch (errorCode) {
    case 1: {
      message = "Invalid GraphQL query"
      code = "SYNTAX_ERROR"
      status = 400
      break
    }
    case 4: {
      message = "Access denied"
      code = "PERMISSION_DENIED"
      status = 403
      break
    }
    case 100: {
      error(errorMessage.message ?? "Unknown exception")
      message = "Unknown exception"
      code = "UNKNOWN"
      status = 500
      break
    }
    case 200: {
      message = "Validation failed"
      code = "VALIDATION_FAILED"
      status = 400
      break
    }
    default: {
      message = errorMessage.message ?? "Unknown exception"
      code = errorMessage.code ?? "UNKNOWN"
      status = 400
    }
  }

  throw new GraphQLError(message, {
    extensions: {
      additionalInformation,
      code,
      http: {
        status,
      },
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

export const calculatePageInfoData = ({
  totalCount,
  perPage,
  page,
}: {
  totalCount: number
  perPage: number
  page?: number
}) => {
  const maxPages = Math.ceil(totalCount / perPage)
  const currentPage = page ?? 1

  const hasPrevious = currentPage - 1 > 0
  const previousPage = hasPrevious ? currentPage - 1 : null

  const hasNext = currentPage < maxPages
  const nextPage = hasNext ? currentPage + 1 : null

  const limit = perPage
  const offset =
    currentPage > 1 ? Math.ceil(currentPage * perPage) - perPage : undefined

  return {
    currentPage,
    hasNext,
    hasPrevious,
    limit,
    maxPages,
    nextPage,
    offset,
    previousPage,
    totalCount,
  }
}

/**
 * Generates the expected config object for the permission check.
 * The provided tables will be deduplicated.
 */
export function createPermission<
  const TConfig extends readonly SchemaConfigEntry[],
>(
  allConfigs: TConfig
): <
  C extends TConfig[number]["catalog"],
  S extends Extract<TConfig[number], { catalog: C }>["schema"],
  TTable extends PermissionTableName<TConfig[number], C, S>,
>(
  catalog: C,
  schema: S,
  tables: readonly TTable[]
) => {
  catalog: C
  schema: S
  tables: TTable[]
}
export function createPermission<
  TConfig extends SchemaConfigEntry = SchemaConfigEntry,
  C extends TConfig["catalog"] = TConfig["catalog"],
  S extends Extract<TConfig, { catalog: C }>["schema"] = Extract<
    TConfig,
    { catalog: C }
  >["schema"],
  TTable extends PermissionTableName<TConfig, C, S> = PermissionTableName<
    TConfig,
    C,
    S
  >,
>(
  catalog: C,
  schema: S,
  tables: readonly TTable[]
): {
  catalog: C
  schema: S
  tables: TTable[]
}
export function createPermission(allConfigs: readonly SchemaConfigEntry[]): (
  catalog: string,
  schema: string,
  tables: readonly string[]
) => {
  catalog: string
  schema: string
  tables: string[]
}
export function createPermission(
  catalog: string,
  schema: string,
  tables: readonly string[]
): {
  catalog: string
  schema: string
  tables: string[]
}
export function createPermission(
  configOrCatalog: readonly SchemaConfigEntry[] | string,
  schema?: string,
  tables?: readonly string[]
) {
  if (Array.isArray(configOrCatalog)) {
    return (
      boundCatalog: string,
      boundSchema: string,
      boundTables: readonly string[]
    ) => createPermission(boundCatalog, boundSchema, boundTables)
  }

  const catalog = configOrCatalog

  if (!schema || !tables) {
    throw new TypeError(
      "createPermission requires either allConfigs or catalog, schema, and tables"
    )
  }

  // Runtime check for duplicates (as a safety measure)
  const uniqueTables = [...tables]
  return { catalog, schema, tables: uniqueTables }
}

export const transformTrinoResponse = <T>({
  response,
  selectFields,
  transformFields,
  dateFields,
  jsonSchema,
  utcDates,
}: {
  response: TrinoArrayResponse<T>[]
  selectFields: string[]
  transformFields?: Record<string, string>
  dateFields?: string[]
  jsonSchema: JSONSchema7
  utcDates?: string[]
}): WrappedTrinoResponse<T> => {
  // get the total count from the first record
  const total_count = response[0]?.[0] ?? 0

  const data = response.map((record) => {
    // since we already fetched the `total_count` above, we can exclude it here
    const [_count, ...rest] = record

    // Map GraphQL field names back to DB column names for correct key assignment.
    // The SQL query uses the DB column names (e.g. "2bs"), so the response values
    // are in that order. We need to use those as keys for the JSON schema lookup.
    const keys = selectFields.map((f) => transformFields?.[f] ?? f)

    const dataAsObject = convertTrinoResponse({
      keys,
      values: rest,
    })

    const transformedResponse = transform({
      data: dataAsObject,
      dateFields,
      definition: jsonSchema,
      // swap transformFields from { graphqlName: dbName } to { dbName: graphqlName }
      // so that transform() can map DB column names back to GraphQL field names
      transformFields: transformFields ? swap(transformFields) : undefined,
      utcDates,
    })

    return transformedResponse
  }) as T[]

  return {
    data,
    total_count,
  }
}
