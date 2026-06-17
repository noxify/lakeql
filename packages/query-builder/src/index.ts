/**
 * Special thanks goes to https://github.com/igalklebanov
 * for solving our edge case issue with multiple schematas <3
 * https://www.answeroverflow.com/m/1227929774144618598
 * and also with helping to solve the type issues <3
 * https://www.answeroverflow.com/m/1228457827572645908
 */
import type { FieldNode, GraphQLResolveInfo, SelectionNode } from "graphql"
import { GraphQLError } from "graphql"
import type {
  BinaryOperator,
  CompiledQuery,
  ExpressionBuilder,
  ExpressionWrapper,
  Selectable,
  SelectExpression,
  SqlBool,
} from "kysely"
import { sql } from "kysely"
import { format } from "sql-formatter"

import { initDb } from "./db"

/**
 * Logical operators for combining filter conditions.
 */
export enum WhereOperator {
  AND = "and",
  OR = "or",
}

/**
 * Comparison operators available for filtering a single field.
 * Only one operator should be set per FieldOptions object.
 *
 * String operators compare the field value against the provided string.
 * Boolean operators (`is`/`isNot`) check for equality with `true`/`false`.
 */
export interface FieldOptions {
  eq?: string
  neq?: string
  in?: string
  notIn?: string
  lt?: string
  lte?: string
  gt?: string
  gte?: string
  like?: string
  notLike?: string
  is?: boolean
  isNot?: boolean
}

/**
 * Defines the sort order for a query result.
 *
 * @template TableDefinition - The table type used to constrain the `field` to valid column names.
 */
export interface SortInput<TableDefinition> {
  /** Column name to sort by. Constrained to valid column names from the table type. */
  field: SelectExpression<
    KyselyDatabase<TableDefinition>,
    keyof KyselyDatabase<TableDefinition>
  >
  /** Sort direction — `"asc"` for ascending, `"desc"` for descending. */
  direction: string
}

/**
 * Controls offset-based pagination.
 */
export interface PagingInput {
  /**
   * Maximum number of rows to return.
   * @default 100
   */
  limit?: number
  /** Number of rows to skip before fetching. */
  offset?: number
}

/**
 * A single field condition — a record where the key is the field name
 * and the value is a [FieldOptions](#field-options) object describing the comparison.
 */
export type Field = Record<string, FieldOptions>

/**
 * A recursive filter structure that can contain AND/OR groups,
 * each holding field conditions or further nested groups.
 */
export type Where = Partial<Record<WhereOperator, (Where | Field)[]>>

/**
 * KyselyDatabase is our generic interface which simulates
 * the normal kysely table definition
 */
interface KyselyDatabase<TableDefinition> {
  tablename: TableDefinition
}

/**
 * Parameters for generating a Trino-compatible SQL query from GraphQL resolve info.
 *
 * @template TableDefinition - The table type definition used by Kysely for type-safe column references.
 */
export interface GenerateQueryProps<TableDefinition> {
  /** The Trino catalog name (e.g. "hive"). */
  catalog: string
  /** The Trino schema name (e.g. "sales"). */
  schema: string
  /** The table name to query. */
  table: string
  /** The columns to select, derived from GraphQL field selections. */
  selectFields: SelectExpression<
    KyselyDatabase<TableDefinition>,
    keyof KyselyDatabase<TableDefinition>
  >[]
  /** The user-provided filter query (WHERE clause). */
  userQuery: Where
  /** Pagination parameters (limit and offset). */
  paging?: PagingInput
  /** Sort order definitions. */
  sorting: SortInput<TableDefinition>[]
  /** Maps GraphQL field names to database column names. */
  transformFields?: Record<string, string>
  /** Fields that should be wrapped in `to_unixtime()` for date conversion. */
  dateFields?: string[]
}

const operatorMap: Record<string, BinaryOperator> = {
  eq: "=",
  gt: ">",
  gte: ">=",
  in: "in",
  is: "=",
  isnot: "!=",
  lt: "<",
  lte: "<=",
  neq: "!=",
  notin: "not in",
}

/**
 * Parameters for building a single field comparison expression.
 */
export interface GetFieldQueryProps<TableDefinition> {
  /** The Kysely expression builder for constructing SQL expressions. */
  eb: ExpressionBuilder<KyselyDatabase<TableDefinition>, "tablename">
  /** The column name to filter on. */
  fieldName: string
  /** The comparison operator (eq, neq, lt, like, etc.). */
  operator: string
  /** The value to compare against. */
  value: unknown
}

/**
 * Builds a single field comparison expression for use in WHERE clauses.
 *
 * @param props - The field query parameters.
 * @returns A Kysely expression wrapper representing the comparison.
 */
export function getFieldQuery<TableDefinition>({
  eb,
  fieldName,
  operator,
  value,
}: GetFieldQueryProps<TableDefinition>): ExpressionWrapper<
  KyselyDatabase<TableDefinition>,
  "tablename",
  SqlBool
> {
  const transformedFieldName = fieldName

  const op = operator.toLowerCase()

  switch (op) {
    case "eq":
    case "neq":
    case "lt":
    case "lte":
    case "gt":
    case "gte":
    case "is":
    case "isnot": {
      return eb(
        sql.id(transformedFieldName),
        operatorMap[op] ?? "=",
        value
      ) as ExpressionWrapper<
        KyselyDatabase<TableDefinition>,
        "tablename",
        SqlBool
      >
    }
    case "in":
    case "notin": {
      return eb(
        sql.id(transformedFieldName),
        operatorMap[op] ?? "=",
        value
      ) as ExpressionWrapper<
        KyselyDatabase<TableDefinition>,
        "tablename",
        SqlBool
      >
    }
    case "like": {
      return eb(sql.id(transformedFieldName), "like", `%${value as string}%`)
    }
    case "notlike": {
      // there is no `notLike` operator in Kysely
      // so we have to use the `like` operator together with `not()`
      // alternative way would be a raw query
      return eb.not(
        eb(sql.id(transformedFieldName), "like", `%${value as string}%`)
      )
    }
    case "startswith": {
      // there is no `startsWith` operator in Kysely
      // so we have to build our own
      return eb(sql.id(transformedFieldName), "like", `${value as string}%`)
    }
    case "notstartswith": {
      // there is no `notStartsWith` operator in Kysely
      // so we have to build our own
      return eb.not(
        eb(sql.id(transformedFieldName), "like", `${value as string}%`)
      )
    }
    case "endswith": {
      // there is no `endsWith` operator in Kysely
      // so we have to build our own
      return eb(sql.id(transformedFieldName), "like", `%${value as string}`)
    }
    case "notendswith": {
      // there is no `notEndsWith` operator in Kysely
      // so we have to build our own
      return eb.not(
        eb(sql.id(transformedFieldName), "like", `%${value as string}`)
      )
    }
    default: {
      return eb(sql.id(transformedFieldName), "=", value)
    }
  }
}

function conditionBuilder<TableDefinition>({
  eb,
  query,
  transformFields,
}: {
  eb: ExpressionBuilder<KyselyDatabase<TableDefinition>, "tablename">
  query: Where
  transformFields?: Record<string, string>
}):
  | ExpressionWrapper<KyselyDatabase<TableDefinition>, "tablename", SqlBool>
  | undefined {
  const filters: ExpressionWrapper<
    KyselyDatabase<TableDefinition>,
    "tablename",
    SqlBool
  >[] = []

  for (const [key, definition] of Object.entries(query)) {
    switch (key.toLowerCase()) {
      case "and": {
        for (const ele of definition) {
          const condition = conditionBuilder<TableDefinition>({
            eb,
            query: ele,
            transformFields,
          })

          if (condition !== undefined) {
            filters.push(condition)
          }
        }

        return eb.and(filters)
      }

      case "or": {
        for (const ele of definition) {
          const condition = conditionBuilder<TableDefinition>({
            eb,
            query: ele,
            transformFields,
          })
          if (condition) {
            filters.push(condition)
          }
        }
        return eb.or(filters)
      }
      default: {
        // since we get an array of array here, we have to flatten it
        // to get an simple array - Array values are not affected
        // eslint-disable-next-line no-case-declarations
        const [fieldOperator, fieldValue] = Object.entries(
          definition as Field[]
        ).flat()

        // eslint-disable-next-line no-case-declarations
        const fieldName = transformFields?.[key] ?? key
        return getFieldQuery({
          eb,

          fieldName,
          operator: fieldOperator as keyof typeof operatorMap,
          value: fieldValue,
        })
      }
    }
  }

  return undefined
}

/**
 * Normalizes filter objects by ensuring each field is in its own object within and/or arrays.
 *
 * Splits multi-field filter objects into separate entries so the query builder
 * can process each field condition independently.
 *
 * @param filter - The filter object to normalize.
 * @returns A normalized filter with individual field entries.
 */
export function normalizeFilter(filter: Where): Where {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!filter) {
    return filter
  }

  const result = { ...filter }

  // Process 'and' conditions
  if (result.and && Array.isArray(result.and)) {
    result.and = result.and.flatMap((item) => {
      // Use type assertion to treat item as a record with string keys
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedItem = item as Record<string, any>

      // Extract logical operators and regular fields
      const keys = Object.keys(typedItem)
      const logicalKeys = keys.filter((k) => k === "and" || k === "or")
      const fieldKeys = keys.filter((k) => k !== "and" && k !== "or")

      // If we have both field keys and logical operators, we need to handle them separately
      /* c8 ignore next 6 */
      if (fieldKeys.length > 0 && logicalKeys.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const fieldObjects = fieldKeys.map((key) => ({ [key]: typedItem[key] }))
        const logicalObjects = logicalKeys.map((key) => ({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          [key]: normalizeFilter({ [key]: typedItem[key] })[key as keyof Where],
        }))

        return [...fieldObjects, ...logicalObjects]
      }

      // If we only have field keys, split them into separate objects
      if (fieldKeys.length > 1 && logicalKeys.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        return fieldKeys.map((key) => ({ [key]: typedItem[key] }))
      }

      // If we have logical operators, recursively normalize them
      if (logicalKeys.length > 0) {
        const normalizedItem = { ...typedItem }
        for (const key of logicalKeys) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          normalizedItem[key] = normalizeFilter({ [key]: typedItem[key] })[
            key as keyof Where
          ]
        }
        return normalizedItem
      }

      return item
    })
  }

  // Process 'or' conditions (same logic as 'and')
  if (result.or && Array.isArray(result.or)) {
    result.or = result.or.flatMap((item) => {
      // Use type assertion to treat item as a record with string keys
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedItem = item as Record<string, any>

      // Extract logical operators and regular fields
      const keys = Object.keys(typedItem)
      const logicalKeys = keys.filter((k) => k === "and" || k === "or")
      const fieldKeys = keys.filter((k) => k !== "and" && k !== "or")

      // If we have both field keys and logical operators, we need to handle them separately
      /* c8 ignore next 6 */
      if (fieldKeys.length > 0 && logicalKeys.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const fieldObjects = fieldKeys.map((key) => ({ [key]: typedItem[key] }))
        const logicalObjects = logicalKeys.map((key) => ({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          [key]: normalizeFilter({ [key]: typedItem[key] })[key as keyof Where],
        }))

        return [...fieldObjects, ...logicalObjects]
      }

      // If we only have field keys, split them into separate objects
      if (fieldKeys.length > 1 && logicalKeys.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        return fieldKeys.map((key) => ({ [key]: typedItem[key] }))
      }

      // If we have logical operators, recursively normalize them
      if (logicalKeys.length > 0) {
        const normalizedItem = { ...typedItem }
        for (const key of logicalKeys) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          normalizedItem[key] = normalizeFilter({ [key]: typedItem[key] })[
            key as keyof Where
          ]
        }
        return normalizedItem
      }

      return item
    })
  }

  return result
}

/**
 * Wraps bare field-level filters into an AND-rooted structure.
 *
 * If the query already has a single `and` or `or` key at the root, it is returned as-is.
 * Otherwise, all entries are combined under an `and` key.
 *
 * @param userQuery - The user-provided filter query.
 * @returns A normalized query with a logical operator at the root.
 */
export function normalizeUserQuery(userQuery: Where): Where {
  const keys = Object.keys(userQuery)

  // If the query is already in the correct format, return it as is
  if (keys.length === 1 && (keys[0] === "and" || keys[0] === "or")) {
    return userQuery
  }

  // Otherwise, transform it to use 'and' at the root level
  return {
    and: Object.entries(userQuery).map(([key, value]) => ({ [key]: value })),
  }
}

/**
 * Generates a compiled SQL query with pagination metadata for Trino.
 *
 * Returns a Kysely `CompiledQuery` containing the generated SQL and parameters.
 * The query uses two CTEs internally:
 * - `total_count` — provides `total_records` (total matching rows before paging)
 * - `records` — the actual rows based on `selectFields`, filtering, sorting, and paging
 *
 * The compiled query is executed by the Trino client which returns the row data.
 *
 * @returns A compiled SQL query ready for execution via the Trino client.
 */
export function generateQuery<TableDefinition>({
  catalog,
  schema,
  table,
  selectFields,
  userQuery,
  sorting,
  paging,
  transformFields,
  dateFields = [],
}: GenerateQueryProps<TableDefinition>) {
  // init a kysely instance
  const db = initDb<KyselyDatabase<TableDefinition>>()

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { ref } = db.dynamic
  const withStatement = db
    // here we calculate the total count based on the user query ( if there is any )
    // the `total_records` will be used later in the graphql `pageInfo`
    .with("total_count", (withDb) =>
      withDb
        .selectFrom(sql.id(catalog, schema, table) as unknown as "tablename")
        .select(({ fn }) => fn.countAll<number>().as("total_records"))
        .$if(Object.keys(userQuery).length > 0, (qb) =>
          qb.where((eb) => {
            const normalizedQuery = normalizeFilter(
              normalizeUserQuery(userQuery)
            )

            const conditions = conditionBuilder<TableDefinition>({
              eb,
              query: normalizedQuery,
              transformFields,
            })

            return conditions ?? eb.and([])
          })
        )
    )
    .with("records", (withDb) => {
      let query = withDb
        .selectFrom(sql.id(catalog, schema, table) as unknown as "tablename")
        .select(
          selectFields.map((field) => {
            if (dateFields.includes(field as unknown as string)) {
              if (transformFields?.[field as unknown as string]) {
                return sql
                  .raw(
                    `to_unixtime(${transformFields[field as unknown as string]})`
                  )
                  .as(
                    transformFields[
                      field as unknown as string
                    ] as unknown as string
                  )
              }

              return sql
                .raw(`to_unixtime(${field as unknown as string})`)
                .as(field as unknown as string)
            }
            // use the transformed name, if there is one for the current field
            if (transformFields?.[field as unknown as string]) {
              return (
                sql
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  .id(transformFields[field as unknown as string]!)
                  .as(
                    transformFields[
                      field as unknown as string
                    ] as unknown as string
                  )
              )
            }

            if (typeof field === "string") {
              return ref<Extract<keyof Selectable<TableDefinition>, string>>(
                field
              )
            }

            return field
          })
        )
        .$if(Object.keys(userQuery).length > 0, (qb) =>
          qb.where((eb) => {
            const normalizedQuery = normalizeFilter(
              normalizeUserQuery(userQuery)
            )

            const conditions = conditionBuilder<TableDefinition>({
              eb,
              query: normalizedQuery,
              transformFields,
            })

            return conditions ?? eb.and([])
          })
        )

      // add sorting
      // Note: We need at least one sort field
      // otherwise there is a risk that the user
      // will get the same result while using the paging
      for (const sort of sorting) {
        const fieldName = (transformFields?.[sort.field as unknown as string] ||
          sort.field) as unknown as string
        query = query.orderBy(
          fieldName,
          sort.direction.toLowerCase() as "asc" | "desc"
        )
      }

      // add paging
      // reference: https://trino.io/blog/2020/02/03/beyond-limit-presto-meets-offset-and-ties.html
      query =
        !paging?.offset || paging.offset <= 0
          ? query.modifyEnd(
              sql.raw(`FETCH FIRST ${paging?.limit ?? 100} ROWS ONLY`)
            )
          : query
              .offset(paging.offset ?? 100)
              .modifyEnd(sql.raw(`FETCH NEXT ${paging.limit ?? 100} ROWS ONLY`))

      return query
    })
    .selectFrom("total_count")
    .selectAll()
    .fullJoin("records", (join) => join.onTrue())

  return withStatement.compile()
}

/**
 * Parameters for formatting a compiled SQL query.
 */
export interface FormatQueryProps<T> {
  /** The compiled Kysely query to format. */
  query: CompiledQuery<T>
}

/**
 * Formats a compiled SQL query for readability.
 *
 * Applies uppercase keywords, PostgreSQL dialect, and interpolates parameters.
 *
 * @param props - The format query parameters.
 * @returns The formatted SQL string with interpolated parameters.
 */
export function formatQuery<T>({ query }: FormatQueryProps<T>) {
  const paramsObject: Record<number, string> = {}

  // we get the query parameters as `["param1", "param2"]`
  // but we need `{1:"param1", 2: "param2"}`, otherwise
  // the formatted query wouldn't include the params
  /* c8 ignore next 9 */
  for (const [index, param] of query.parameters.entries()) {
    paramsObject[index + 1] =
      typeof param === "string" ? String(`'${param}'`) : String(param)
  }

  return format(query.sql, {
    keywordCase: "upper",
    language: "postgresql",
    params: paramsObject,
    tabWidth: 0,
    useTabs: false,
  })
}

/**
 * Extracts selected field names from a GraphQL resolve info object.
 *
 * @param graphqlInfo - The GraphQL resolve info from the resolver.
 * @param withNodes - When true, looks inside the `nodes` selection (for Connection types).
 * @returns An array of field names to use as SELECT columns.
 */
export function getSelectFields<T>(
  graphqlInfo: GraphQLResolveInfo,
  withNodes = false
) {
  return graphqlInfo.fieldNodes.flatMap((fieldNode) => {
    const baseSelections = fieldNode.selectionSet?.selections as SelectionNode[]

    let selections: SelectionNode[] = []

    if (withNodes) {
      const nodesSelection = baseSelections.find(
        (ele) => (ele as FieldNode).name.value === "nodes"
      ) as FieldNode

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!nodesSelection) {
        throw new GraphQLError(
          "No fields to return defined. Please specify at least one field inside `nodes`."
        )
      }
      selections = (nodesSelection.selectionSet?.selections ??
        []) as SelectionNode[]
    } else {
      selections = (fieldNode.selectionSet?.selections ?? []) as SelectionNode[]
    }

    return selections.flatMap(
      (selection) => (selection as FieldNode).name.value
    )
  }) as GenerateQueryProps<T>["selectFields"]
}
