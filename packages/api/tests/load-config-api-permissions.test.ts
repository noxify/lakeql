import path from "node:path"

import { loadConfig } from "@lakeql/config"
import { describe, expect, it } from "vitest"

const fixtureDir = path.join(
  import.meta.dirname,
  "fixtures",
  "config-with-api-permissions"
)

/**
 * Finding 5 acceptance proof. The documented authoring path has
 * `src/permissions.ts` import `createPermission` from `@lakeql/api/helpers`,
 * and `lakeql.config.ts` import those rules. `loadConfig` resolves the config
 * through jiti, which must evaluate the permissions module — and therefore the
 * real `@lakeql/api` module graph — at load time. This lives in `packages/api`
 * (not `packages/config`) so the fixture can resolve `@lakeql/api/helpers`
 * without `@lakeql/config` depending on `@lakeql/api` and inverting the build
 * graph. It adds no change to API source.
 */
describe("loadConfig evaluates a permissions module that imports @lakeql/api/helpers", () => {
  it("resolves the API helper through jiti and surfaces the authored rules at auth.permissions", async () => {
    const project = await loadConfig({ cwd: fixtureDir })

    const permissions = project.config.auth?.permissions
    expect(permissions).toBeDefined()
    expect(permissions).toHaveLength(1)
    expect(permissions?.[0]?.name).toBe("reporting-user")
    // The rule shape produced by createPermission survived the load.
    expect(permissions?.[0]?.permissions.Query[0]?.dataSource).toBe("warehouse")
    expect(permissions?.[0]?.permissions.Query[0]?.rules[0]?.schema).toBe(
      "sales"
    )
  })
})
