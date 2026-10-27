import type { Permission } from "@lakeql/config"

/**
 * Permission rules for technical users.
 *
 * Empty by default — every request runs as the resolved user with no
 * table-level restrictions declared here. Add entries to grant a technical
 * user scoped read/write access. Example:
 *
 *   import { createPermission } from "@lakeql/api/helpers"
 *
 *   export const permissions: Permission[] = [
 *     {
 *       name: "testuser",
 *       useSystemUser: false,
 *       permissions: {
 *         Query: [
 *           createPermission("warehouse", (rule) => [
 *             rule({ schema: "sales", tables: ["orders"] }),
 *           ]),
 *         ],
 *         Mutation: [],
 *       },
 *     },
 *   ]
 */
export const permissions: Permission[] = []
