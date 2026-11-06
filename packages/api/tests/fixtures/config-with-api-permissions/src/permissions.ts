import { createPermission } from "@lakeql/api/helpers"
import type { Permission } from "@lakeql/config"

/**
 * Permission rules authored the documented way: via `createPermission` from
 * `@lakeql/api/helpers`. `lakeql.config.ts` imports this module, so loading the
 * project config pulls the real API helper (and its module graph) through
 * jiti. This fixture proves that authoring path resolves at config-load time.
 */
export const permissions: Permission[] = [
  {
    name: "reporting-user",
    useSystemUser: false,
    permissions: {
      Query: [
        createPermission("warehouse", (rule) => [
          rule({ schema: "sales", tables: ["orders"] }),
        ]),
      ],
      Mutation: [],
    },
  },
]
