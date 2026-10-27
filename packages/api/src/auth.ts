import type { JWTPayload, Permission } from "@lakeql/config"

import { env } from "./env"
import type { Context, PermissionFields } from "./types"

/**
 * Default token resolver — mock auth for development.
 *
 * In production, callers should supply their own `TokenResolver`
 * through `ApiRuntimeConfig.tokenResolver`.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function tokenResolver(
  req: Request
): Promise<JWTPayload | null | undefined> {
  const authHeader = req.headers.get("authorization")

  if (
    authHeader &&
    env.AUTH_MOCK === true &&
    authHeader === env.AUTH_MOCK_TOKEN
  ) {
    const user: JWTPayload = {
      userName: req.headers.get("x-username") ?? "###FALLBACK_MOCK_USER###",
    }

    // eslint-disable-next-line no-console
    console.debug("Use Mock Auth with User:", user)

    return user
  }

  return null
}

/**
 * Tests whether any rule in `rules` matches the given permission target fields.
 *
 * Scope matching fails closed: a rule that names a `catalog` or a concrete
 * `schema` only matches a target that carries the same value. A target that
 * omits `catalog`/`schema` therefore does NOT match a rule scoped to one —
 * the rule's scope is never silently ignored.
 *
 * A rule matches when:
 * - `catalog` is omitted in the rule (matches any), or equal to the target catalog.
 * - `schema` is `"*"` (matches any), or equal to the target schema.
 * - `tables` contains the target table name, or `["*"]` for wildcard.
 */
function matchesRules(
  rules: Permission["permissions"]["Query"][number]["rules"],
  fields: PermissionFields
): boolean {
  return rules.some((rule) => {
    // Catalog check: an omitted rule.catalog matches any; a named catalog must
    // equal the target's (so a target without a catalog does not match).
    if (rule.catalog && rule.catalog !== fields.catalog) {
      return false
    }

    // Schema check: "*" matches any; a concrete schema must equal the target's
    // (so a target without a schema does not match a schema-scoped rule).
    if (rule.schema !== "*" && rule.schema !== fields.schema) {
      return false
    }

    // Table check: ["*"] matches all tables, otherwise must include the table.
    if (rule.tables.length > 0 && rule.tables[0] === "*") {
      return true
    }

    return rule.tables.includes(fields.tableName)
  })
}

/**
 * Checks whether the current user may read from a data source table.
 *
 * Authorization model:
 * - Unauthenticated users are denied.
 * - Service principals without an explicit permission entry are denied.
 * - Human users without a permission entry are allowed (Trino/adapter enforces).
 * - If rules exist, at least one `Query` rule for the data source must match.
 *
 * @param args - Permission check input.
 * @returns `true` if read access is allowed, otherwise `false`.
 */
export function hasReadPermission({
  context,
  dataSource,
  tableName,
  catalog,
  schema,
}: { context: Context } & PermissionFields): boolean {
  const { permissions } = context

  // Unauthenticated → deny
  if (!context.currentUser) {
    return false
  }

  const userName =
    context.identity?.userName ?? context.currentUser.userName ?? ""

  // Find the permission entry for this user
  const userPermissions = permissions.find((p) => p.name === userName)

  // No permission entry
  if (!userPermissions) {
    // Service principals need explicit rules — deny if none configured
    if (context.identity?.isServicePrincipal) {
      return false
    }
    // Human users: allow — the adapter layer enforces its own access control
    return true
  }

  // Find Query rules that target this data source
  const dataSourceRules = userPermissions.permissions.Query.filter(
    (q) => q.dataSource === dataSource
  )

  // No Query rules for this data source → allow for humans, deny for SPs
  if (dataSourceRules.length === 0) {
    return !context.identity?.isServicePrincipal
  }

  // Check if any rule set matches the target fields
  const fields: PermissionFields = { dataSource, tableName, catalog, schema }
  return dataSourceRules.some((q) => matchesRules(q.rules, fields))
}

/**
 * Checks whether the current user may perform write operations on a data source table.
 *
 * Authorization model:
 * - Unauthenticated users are denied.
 * - If no user-specific `Mutation` rules exist, write access is denied.
 * - If rules exist, at least one rule for the data source must match.
 *
 * @param args - Permission check input.
 * @returns `true` if write access is allowed, otherwise `false`.
 */
export function hasWritePermission({
  context,
  dataSource,
  tableName,
  catalog,
  schema,
}: { context: Context } & PermissionFields): boolean {
  const { permissions } = context

  // Unauthenticated → deny
  if (!context.currentUser) {
    return false
  }

  const userName =
    context.identity?.userName ?? context.currentUser.userName ?? ""

  // Find the permission entry for this user
  const userPermissions = permissions.find((p) => p.name === userName)

  // No permission entry → deny writes (writes require explicit authorization)
  if (!userPermissions) {
    return false
  }

  // Find Mutation rules that target this data source
  const dataSourceRules = userPermissions.permissions.Mutation.filter(
    (m) => m.dataSource === dataSource
  )

  // No Mutation rules for this data source → deny
  if (dataSourceRules.length === 0) {
    return false
  }

  // Check if any rule set matches the target fields
  const fields: PermissionFields = { dataSource, tableName, catalog, schema }
  return dataSourceRules.some((m) => matchesRules(m.rules, fields))
}
