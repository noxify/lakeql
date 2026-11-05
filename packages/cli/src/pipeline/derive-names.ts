import { camelCase, upperFirst } from "lodash-es"

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
 * Derives the base class, query, and mutation names for a table.
 *
 * When `namePrefix` is set, it is prepended — case-normalized per target
 * context — to each generated name so sources that expose same-named tables
 * no longer collide:
 *
 * - **Type name** (`baseClassName`): `UpperFirst(camelCase(prefix))` prepended
 *   as a new leading `_`-separated segment (e.g. `Trino_Tier1OpenLake_…`).
 * - **Query name**: `camelCase(prefix)` prepended seamlessly; the schema
 *   segment is upper-cased at the seam so it reads `trinoTier1…`, not
 *   `trinotier1…`.
 * - **Mutation name**: the `create` verb stays leading, then
 *   `UpperFirst(camelCase(prefix))`, then the rest (`createTrinoTier1…`).
 *
 * The prefix is trimmed; an empty or whitespace-only value is treated as unset.
 * When unset, the returned names are byte-for-byte identical to the output
 * without a prefix.
 *
 * @param schema - The database schema name.
 * @param tableName - The table name.
 * @param namePrefix - Optional per-data-source prefix in any casing.
 * @returns The derived base class, query, and mutation names.
 */
export function deriveNames(
  schema: string,
  tableName: string,
  namePrefix?: string
): DerivedNames {
  const raw = namePrefix?.trim()
  const hasPrefix = Boolean(raw)

  const schemaSegment = upperFirst(camelCase(schema))
  const tableSegment = upperFirst(camelCase(tableName))

  if (!hasPrefix) {
    return {
      baseClassName: `${schemaSegment}_${tableSegment}`,
      queryName: `${camelCase(schema)}${tableSegment}`,
      mutationName: `create${camelCase(schema)}${tableSegment}`,
    }
  }

  const typeSegment = upperFirst(camelCase(raw))
  const querySegment = camelCase(raw)

  return {
    baseClassName: `${typeSegment}_${schemaSegment}_${tableSegment}`,
    queryName: `${querySegment}${schemaSegment}${tableSegment}`,
    mutationName: `create${typeSegment}${schemaSegment}${tableSegment}`,
  }
}
