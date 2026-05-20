import SchemaBuilder from "@pothos/core"
import ScopeAuthPlugin from "@pothos/plugin-scope-auth"
import ValidationPlugin from "@pothos/plugin-validation"
import { DateResolver, DateTimeResolver } from "graphql-scalars"
import { z } from "zod"

import { hasReadPermission, hasWritePermission } from "./auth"
import { createComparisonTypes } from "./comparison"
import { env } from "./env"
import { handleErrorResponse, throwFirstError } from "./helpers"
import type {
  Context,
  PageInfoInterface,
  PermissionFields,
  UserScalars,
} from "./types"

export const builder = new SchemaBuilder<{
  Context: Context
  Scalars: Partial<UserScalars["Scalars"]>
  AuthScopes: {
    authorized: boolean
    readPermission: PermissionFields
    writePermission: PermissionFields
  }
}>({
  plugins: [ScopeAuthPlugin, ValidationPlugin],
  scopeAuth: {
    authScopes: (context) => ({
      authorized: !!context.currentUser,
      readPermission: ({ catalog, schema, tableName }) =>
        (context.hasReadPermission ?? hasReadPermission)({
          catalog,
          context,
          schema,
          tableName,
        }),
      writePermission: ({ catalog, schema, tableName }) =>
        (context.hasWritePermission ?? hasWritePermission)({
          catalog,
          context,
          schema,
          tableName,
        }),
    }),
    defaultStrategy: "any",
    treatErrorsAsUnauthorized: true,
    unauthorizedError: (parent, context, info, result) => {
      // throw an error if it's found
      // this handles also 403 errors ( aka Permission denied)
      throwFirstError(result.failure)
      // throw a fallback error if no error was found
      return new Error(`Not authorized`)
    },
  },

  validation: {
    validationError: (validationResult) =>
      handleErrorResponse({
        errorMessage: {
          additionalInformation: validationResult.issues,

          errorCode: 200,
        },
      }),
  },
})

builder.addScalarType("Date", DateResolver, {})
builder.addScalarType("DateTime", DateTimeResolver, {})
builder.scalarType("File", {
  serialize: () => {
    throw new Error("Uploads can only be used as input types")
  },
})

export const SortDirection = builder.enumType("SortDirection", {
  values: ["ASC", "DESC"] as const,
})

const maxRecordsPerPage = env.API_MAX_RECORDS_PER_PAGE
let runtimeMaxRecordsPerPage = maxRecordsPerPage

export function setMaxRecordsPerPage(value?: number) {
  if (value === null || value === undefined) {
    runtimeMaxRecordsPerPage = maxRecordsPerPage
    return
  }

  runtimeMaxRecordsPerPage = Math.max(1, Math.trunc(value))
}

export function getMaxRecordsPerPage() {
  return runtimeMaxRecordsPerPage
}

export const Paging = builder.inputType("Paging", {
  fields: (t) => ({
    page: t.int({ defaultValue: 1 }),
    perPage: t.int({
      defaultValue: 100,
      description: `Defines the number of records which should be shown. Minimum is \`1\`. Maximum is \`${getMaxRecordsPerPage()}\`. Default is \`100\`.`,
      validate: z
        .number()
        .min(1)
        .refine((value) => value <= getMaxRecordsPerPage(), {
          message: `Value must be less than or equal to ${getMaxRecordsPerPage()}`,
        }),
    }),
  }),
})

export const PageInfo = builder
  .objectRef<PageInfoInterface>("PageInfo")
  .implement({
    fields: (t) => ({
      currentPage: t.expose("currentPage", { type: "Int" }),
      hasNext: t.expose("hasNext", { type: "Boolean" }),
      hasPrevious: t.expose("hasPrevious", { type: "Boolean" }),
      maxPages: t.expose("maxPages", { type: "Int" }),
      nextPage: t.expose("nextPage", {
        description:
          "Defines the value which can be used in the `paging` arg to go to the previous page",
        nullable: true,
        type: "Int",
      }),
      previousPage: t.expose("previousPage", {
        description:
          "Defines the value which can be used in the `paging` arg to go to the next page",
        nullable: true,
        type: "Int",
      }),
    }),
  })

builder.queryType({})

//builder.mutationType({})

const comparisonTypes = createComparisonTypes(builder)

export const StringFieldComparison =
  comparisonTypes.createStringFieldComparison({})
export const IntFieldComparison = comparisonTypes.createIntFieldComparison({})
export const FloatFieldComparison = comparisonTypes.createFloatFieldComparison(
  {}
)
export const BooleanFieldComparison =
  comparisonTypes.createBooleanFieldComparison({})
export const DateFieldComparison = comparisonTypes.createDateFieldComparison({})
export const DateTimeFieldComparison =
  comparisonTypes.createDateTimeFieldComparison({})
export const IDFieldComparison = comparisonTypes.createIDFieldComparison({})
