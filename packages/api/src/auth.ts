import type { JWTPayload } from "jose"

import { env } from "./env"
import type { Context, PermissionFields } from "./types"

// eslint-disable-next-line @typescript-eslint/require-await
export async function getUser(
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
 * Checks whether the current user may read from a table.
 *
 * Authorization model:
 * - Unauthenticated users are denied.
 * - If no user-specific `Query` rules exist, read access is allowed.
 * - If rules exist, at least one rule must match `catalog`, `schema`, and `tableName`.
 * - A `"*"` table entry matches all tables in the schema.
 *
 * @param args Permission check input.
 * @param args.context Request context including authenticated user and configured permissions.
 * @param args.catalog Target catalog.
 * @param args.schema Target schema.
 * @param args.tableName Target table.
 * @returns {boolean} `true` if read access is allowed, otherwise `false`.
 */
export function hasReadPermission({
  context,
  catalog,
  schema,
  tableName,
}: { context: Context } & PermissionFields): boolean {
  const { permissions } = context

  //Unauthorized Access
  if (!context.currentUser) {
    return false
  }

  // find permissions for the current user
  const userPermissions = permissions.find(
    (ele) => ele.name === context.currentUser?.userName
  )

  /**
   * Decision model for read access:
   * - If there is no user entry in `permissions`, or the user has no `Query` rules,
   *   this function allows the read request.
   *
   * Why this default-allow can be valid:
   * - Human users (OAuth2 Authorization Code Flow) typically exist in Trino.
   *   In that case, Trino enforces schema/table permissions directly for that user,
   *   so this wrapper does not need an additional allow list for every person.
   *
   * Why application-level rules are still needed:
   * - Technical users (OAuth2 Client Credentials Flow) may not exist in Trino.
   *   Requests are then often executed via an external system user that can access
   *   many or all tables. For these clients, `permissions` acts as a service-side
   *   allow list to enforce table-level restrictions.
   *
   * Practical effect:
   * - Trino remains the primary authorization layer for human identities.
   * - `permissions` adds explicit policy-as-code controls for technical clients.
   */
  if (!userPermissions || userPermissions.permissions.Query.length === 0) {
    return true
  }

  // if there is a query definition for the user, we check if it matches with the given catalog/schema/table
  // ( includes also `*` for all tables inside a schema)
  const foundQueryConfig = userPermissions.permissions.Query.find(
    (ele) =>
      ele.catalog === catalog &&
      ele.schema === schema &&
      (ele.tables.includes(tableName) ||
        (ele.tables.length > 0 &&
          ele.tables[0] === ("*" as (typeof ele.tables)[number])))
  )

  // the query definition doesn't match, we deny the access to the requested table
  if (!foundQueryConfig) {
    return false
  }

  // seems that the user has the permission to perform the read operation
  return true
}

/**
 * Checks whether the current user may perform write operations on a table.
 *
 * Authorization model:
 * - Unauthenticated users are denied.
 * - If no user-specific `Mutation` rules exist, write access is denied.
 * - If rules exist, at least one rule must match `catalog`, `schema`, and `tableName`.
 * - A `"*"` table entry matches all tables in the schema.
 *
 * Note: write statements may execute via a system user in Trino, so this
 * application-level check is the primary guardrail for table-level write access.
 *
 * @param args Permission check input.
 * @param args.context Request context including authenticated user and configured permissions.
 * @param args.catalog Target catalog.
 * @param args.schema Target schema.
 * @param args.tableName Target table.
 * @returns {boolean} `true` if write access is allowed, otherwise `false`.
 */
export function hasWritePermission({
  context,
  catalog,
  schema,
  tableName,
}: { context: Context } & PermissionFields): boolean {
  const { permissions } = context

  //Unauthorized Access
  if (!context.currentUser) {
    return false
  }

  // find permissions for the current user
  const userPermissions = permissions.find(
    (ele) => ele.name === context.currentUser?.userName
  )

  /**
   * Decision model for write access:
   * - If there is no user entry in `permissions`, or the user has no `Mutation` rules,
   *   this function denies the write request.
   *
   * Why this default-deny is intentional:
   * - Write operations are more sensitive than reads and should require explicit
   *   authorization at the application layer.
   * - For write statements sent to Trino (for example `CREATE TABLE`), this service
   *   uses a system user in the background. Therefore, the execution path is the
   *   same for human users and technical users.
   * - In many data platforms, each table has a defined source system as data owner.
   *   Write access should usually be limited to that owning system to protect
   *   data ownership boundaries.
   * - Because Trino sees the system identity for these operations, `Mutation`
   *   rules must enforce who is allowed to perform writes at table level.
   *
   * Practical effect:
   * - Writes are only possible when a matching table rule exists in
   *   `permissions.Mutation`.
   * - This enforces least privilege and reduces the risk of unintended
   *   cross-system data manipulation.
   */
  if (!userPermissions || userPermissions.permissions.Mutation.length === 0) {
    return false
  }

  // maybe `*` is a bit risky for write permissions, but we support it for consistency with the read permissions
  // This allows to define users that can write to all tables in a specific schema,
  // which can be useful for technical users that are responsible for a whole data domain
  // or in case you have to debug something and you're too lazy to add X tables to the allow list ;)
  const foundMutationConfig = userPermissions.permissions.Mutation.find(
    (ele) =>
      ele.catalog === catalog &&
      ele.schema === schema &&
      (ele.tables.includes(tableName) ||
        (ele.tables.length > 0 &&
          ele.tables[0] === ("*" as (typeof ele.tables)[number])))
  )

  // the query definition doesn't match, we deny the access to the requested table
  if (!foundMutationConfig) {
    return false
  }

  // seems that the user has the permission to perform the write operation
  return true
}
