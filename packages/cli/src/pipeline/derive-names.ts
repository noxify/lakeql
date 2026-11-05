import { toCamelCase, toUpperFirst } from "@lakeql/helpers/string-case"

import { CliError } from "@/errors"

/**
 * The three generated GraphQL names derived from a table's schema and name.
 *
 * Every other generated name (filter inputs, sort fields, connection types,
 * the interface name, nested field types) derives from these three, so
 * prefixing here propagates to the entire generated surface.
 */
export interface DerivedNames {
  baseClassName: string
  queryName: string
  mutationName: string
}

/**
 * Matches a valid GraphQL name per the specification: a leading underscore or
 * ASCII letter, followed by any run of underscores, ASCII letters, and digits.
 */
const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/u

/**
 * Validates that a per-data-source `namePrefix` yields a valid GraphQL name once
 * `deriveNames` camel-cases it, and throws a descriptive {@link CliError} when
 * it does not.
 *
 * The check runs the exact same `toCamelCase` ({@link @lakeql/helpers} `deburr`
 * then strict `camelCase`) that {@link deriveNames} uses to build the generated
 * names, then validates the result against the GraphQL name grammar
 * `/^[_A-Za-z][_0-9A-Za-z]*$/`. Because the validator and the generator share
 * one casing function, the two cannot drift. `deriveNames` also applies
 * `toUpperFirst` to the type and mutation segments, but it only changes the case
 * of the first character (a letter stays a letter, a digit stays a digit), so
 * validating the plain `toCamelCase` result covers every generated segment.
 *
 * Rejected cases include, for example:
 *
 * - A prefix that camel-cases to `""` (e.g. `"---"`, `"_"`, `"!!!"`), which would
 *   otherwise become a leading-underscore type name.
 * - A prefix whose camel-cased form starts with a digit (e.g. `"1x"`→`"1X"`,
 *   `"123"`), which is not a valid GraphQL name.
 * - A prefix whose camel-cased form retains non-ASCII letters that `camelCase`
 *   cannot fold (e.g. `"a日"`→`"a日"`, `"Ωmega"`→`"ωmega"`).
 *
 * Deburrable prefixes are accepted because `toCamelCase` folds Latin diacritics
 * and ligatures to ASCII first (e.g. `"é1"`→`"e1"`, `"über"`→`"uber"`,
 * `"ß"`→`"ss"`). Strict `camelCase` also drops symbol/currency characters as
 * non-word (e.g. `"x_€"`→`"x"`, accepted), whereas `lodash` kept them (`"x€"`,
 * which was never a valid GraphQL name and was rejected).
 *
 * @param prefix - The trimmed, non-empty prefix to validate.
 * @param normalized - The `camelCase(prefix)` result (passed in to avoid a
 *   second camel-casing).
 * @param sourceName - The configured data-source name, for error context.
 * @throws {CliError} When `normalized` is not a valid GraphQL name.
 */
function assertValidPrefix(
  prefix: string,
  normalized: string,
  sourceName?: string
): void {
  if (GRAPHQL_NAME.test(normalized)) {
    return
  }

  const source = sourceName ? ` for data source "${sourceName}"` : ""
  throw new CliError(
    `Invalid namePrefix "${prefix}"${source}: after camel-casing it must be a valid GraphQL name (matching /^[_A-Za-z][_0-9A-Za-z]*$/).`,
    {
      code: "INVALID_NAME_PREFIX",
      hint: 'Use a prefix that starts with an ASCII letter and contains only ASCII letters, digits, or separators (e.g. "trino", "my-trino").',
    }
  )
}

/**
 * Validates a per-data-source `namePrefix` fail-fast, independently of name
 * derivation, using the exact same check {@link deriveNames} applies at
 * generate time.
 *
 * A prefix is trimmed; an empty or whitespace-only value is treated as unset
 * and passes without a check. A non-empty prefix is camel-cased with the same
 * `toCamelCase` the generator uses and validated against the GraphQL name
 * grammar, so an up-front call and the later generate-time call can never
 * disagree.
 *
 * Callers use this to reject an invalid prefix once, before any pull work and
 * before any network I/O, so the user sees the clear {@link CliError} instead of
 * a downstream failure that masks the root cause.
 *
 * @param namePrefix - The per-data-source prefix in any casing, possibly unset.
 * @param sourceName - Optional data-source name, used only for error context
 *   when the prefix is rejected.
 * @throws {CliError} When a non-empty `namePrefix` does not camel-case to a
 *   valid GraphQL name.
 */
export function assertValidNamePrefix(
  namePrefix?: string,
  sourceName?: string
): void {
  const raw = namePrefix?.trim()
  if (!raw) {
    return
  }

  assertValidPrefix(raw, toCamelCase(raw), sourceName)
}

/**
 * Derives the base class, query, and mutation names for a table.
 *
 * When `namePrefix` is set, it is prepended — case-normalized per target
 * context — to each generated name so sources that expose same-named tables
 * no longer collide:
 *
 * - **Type name** (`baseClassName`): `toUpperFirst(toCamelCase(prefix))`
 *   prepended as a new leading `_`-separated segment (e.g. `Trino_Tier1OpenLake_…`).
 * - **Query name**: `toCamelCase(prefix)` prepended seamlessly; the schema
 *   segment is upper-cased at the seam so it reads `trinoTier1…`, not
 *   `trinotier1…`.
 * - **Mutation name**: the `create` verb stays leading, then
 *   `toUpperFirst(toCamelCase(prefix))`, then the rest (`createTrinoTier1…`).
 *
 * The prefix is trimmed; an empty or whitespace-only value is treated as unset.
 * When unset, the returned names are byte-for-byte identical to the output
 * without a prefix.
 *
 * When a prefix is set it is validated fail-fast: if its `camelCase` form is not
 * a valid GraphQL name, a {@link CliError} naming the data source and the
 * offending prefix is thrown before any name is derived.
 *
 * @param schema - The database schema name.
 * @param tableName - The table name.
 * @param namePrefix - Optional per-data-source prefix in any casing.
 * @param sourceName - Optional data-source name, used only for error context
 *   when an invalid `namePrefix` is rejected.
 * @returns The derived base class, query, and mutation names.
 * @throws {CliError} When a non-empty `namePrefix` does not camel-case to a
 *   valid GraphQL name.
 */
export function deriveNames(
  schema: string,
  tableName: string,
  namePrefix?: string,
  sourceName?: string
): DerivedNames {
  const raw = namePrefix?.trim()
  const hasPrefix = Boolean(raw)

  const schemaSegment = toUpperFirst(toCamelCase(schema))
  const tableSegment = toUpperFirst(toCamelCase(tableName))

  if (!hasPrefix) {
    return {
      baseClassName: `${schemaSegment}_${tableSegment}`,
      queryName: `${toCamelCase(schema)}${tableSegment}`,
      mutationName: `create${toCamelCase(schema)}${tableSegment}`,
    }
  }

  const querySegment = toCamelCase(raw as string)
  // Validate the actual camel-cased prefix against the GraphQL name grammar
  // using the same toCamelCase that produces the names, so there is zero drift.
  assertValidPrefix(raw as string, querySegment, sourceName)
  const typeSegment = toUpperFirst(querySegment)

  return {
    baseClassName: `${typeSegment}_${schemaSegment}_${tableSegment}`,
    queryName: `${querySegment}${schemaSegment}${tableSegment}`,
    mutationName: `create${typeSegment}${schemaSegment}${tableSegment}`,
  }
}
