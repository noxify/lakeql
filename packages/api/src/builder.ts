import SchemaBuilder from "@pothos/core"
// The bare specifier is kept alongside the default import on purpose: the
// side-effect form survives dts bundling, which keeps the Pothos plugin global
// type augmentations (e.g. scope-auth's `authScopes` on field options) in the
// emitted declaration file. Consumers of the built `builder` export — including
// generated query-schema files — then see the augmented types without
// depending on the plugins directly.
// oxlint-disable import/no-duplicates
import "@pothos/plugin-scope-auth"
import "@pothos/plugin-validation"
import ScopeAuthPlugin from "@pothos/plugin-scope-auth"
import ValidationPlugin from "@pothos/plugin-validation"
// oxlint-enable import/no-duplicates
import { DateResolver, DateTimeResolver } from "graphql-scalars"

import { hasReadPermission, hasWritePermission } from "./auth"
import { createComparisonTypes } from "./comparison"
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
      readPermission: ({ dataSource, tableName, catalog, schema }) =>
        (context.hasReadPermission ?? hasReadPermission)({
          catalog,
          context,
          dataSource,
          schema,
          tableName,
        }),
      writePermission: ({ dataSource, tableName, catalog, schema }) =>
        (context.hasWritePermission ?? hasWritePermission)({
          catalog,
          context,
          dataSource,
          schema,
          tableName,
        }),
    }),
    defaultStrategy: "any",
    treatErrorsAsUnauthorized: true,
    unauthorizedError: (_parent, _context, _info, result) => {
      // throw an error if it's found
      // this handles also 403 errors ( aka Permission denied)
      throwFirstError(result.failure)
      // throw a fallback error if no error was found
      return new Error(`Not authorized`)
    },
  },

  validation: {
    validationError: (validationResult) =>
      handleErrorResponse(
        new Error(
          validationResult.issues.map((i) => i.message).join("; ") ||
            "Validation failed"
        )
      ),
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

export const Paging = builder.inputType("Paging", {
  fields: (t) => ({
    page: t.int({ defaultValue: 1 }),
    perPage: t.int({
      description:
        "Number of records to return for this page. Must be a positive integer. When omitted, the data source's configured default page size is used. The maximum allowed value is configured per data source and enforced by the server.",
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
          "Defines the value which can be used in the `paging` arg to go to the next page",
        nullable: true,
        type: "Int",
      }),
      previousPage: t.expose("previousPage", {
        description:
          "Defines the value which can be used in the `paging` arg to go to the previous page",
        nullable: true,
        type: "Int",
      }),
    }),
  })

builder.queryType({})

const comparisonTypes = createComparisonTypes(builder)

export const StringFieldComparison = comparisonTypes.String
export const IntFieldComparison = comparisonTypes.Int
export const FloatFieldComparison = comparisonTypes.Float
export const BooleanFieldComparison = comparisonTypes.Boolean
export const DateFieldComparison = comparisonTypes.Date
export const DateTimeFieldComparison = comparisonTypes.DateTime
export const IDFieldComparison = comparisonTypes.ID
