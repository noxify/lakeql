// oxlint-disable vitest/max-expects -- each test asserts several facets of one authorization decision

import { hasReadPermission, hasWritePermission } from "@lakeql/api/auth"
import { createPermission } from "@lakeql/api/helpers"
import type { Context } from "@lakeql/api/types"
import { defineConfig } from "@lakeql/config"
import type { JWTPayload, Permission, ResolvedIdentity } from "@lakeql/config"
import { describe, expect, it } from "vitest"

/**
 * Acceptance proof that the `auth.permissions` surface is live end to end:
 * rules authored for `defineConfig` actually reach the API authorizer.
 *
 * The task required proving that a value set via
 * `defineConfig({ auth: { permissions } })` flows into the authorization path
 * (`hasReadPermission` / `hasWritePermission`). Those functions live in
 * `@lakeql/api`, which `@lakeql/config` cannot depend on without inverting the
 * build graph, and `packages/api` must stay byte-identical to its baseline.
 * This private, non-published tooling package resolves that cleanly: it
 * devDepends on both packages (as `tooling/type-tests` already does for
 * compile-time cross-package assertions), so the test can import the real
 * `createPermission`, `defineConfig`, and the public authorizer without adding
 * any cross-dependency to a published package.
 *
 * The flow mirrors the generated app: rules are built with the real
 * `createPermission` from `@lakeql/api/helpers`, declared on `defineConfig`'s
 * `auth.permissions`, read back off the normalized config exactly as
 * `index.ts` reads `project.config.auth?.permissions`, and fed into the
 * authorizer. A hand-built array (as `packages/api/tests/auth.test.ts` uses)
 * would prove nothing new — here the array originates from `defineConfig`.
 */

/** Resolve the permissions the wiring would hand to `defineApiConfig`. */
function configPermissions(permissions: Permission[]): Permission[] {
  const result = defineConfig({
    sourcePath: "src",
    adapters: [],
    dataSources: {},
    auth: { permissions },
  })

  // Exactly what src/index.ts reads and forwards to defineApiConfig.
  return result.auth?.permissions ?? []
}

/**
 * Build the GraphQL `Context` the authorizer inspects. `getReadStrategy` is
 * required by the interface but never called by the permission checks, so a
 * throwing stub keeps the type honest without pulling in a real runtime.
 */
function createContext(args: {
  permissions: Permission[]
  userName: string
  isServicePrincipal?: boolean
}): Context {
  const currentUser: JWTPayload = { userName: args.userName }
  const identity: ResolvedIdentity = {
    userName: args.userName,
    isServicePrincipal: args.isServicePrincipal ?? false,
  }

  return {
    currentUser,
    identity,
    permissions: args.permissions,
    getReadStrategy: () => {
      throw new Error("getReadStrategy must not be called by permission checks")
    },
  }
}

describe("defineConfig auth.permissions reach the API authorizer", () => {
  it("allows a read that a config-sourced Query rule matches", () => {
    const permissions = configPermissions([
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
    ])

    const context = createContext({ permissions, userName: "reporting-user" })

    expect(
      hasReadPermission({
        context,
        dataSource: "warehouse",
        tableName: "orders",
        schema: "sales",
      })
    ).toBeTruthy()

    // A table outside the rule's scope is denied for a user that has an entry.
    expect(
      hasReadPermission({
        context,
        dataSource: "warehouse",
        tableName: "secrets",
        schema: "sales",
      })
    ).toBeFalsy()
  })

  it("applies the empty-rules default: human reads allowed, service-principal reads denied", () => {
    const permissions = configPermissions([])

    const humanContext = createContext({
      permissions,
      userName: "someone",
      isServicePrincipal: false,
    })
    const spContext = createContext({
      permissions,
      userName: "sp",
      isServicePrincipal: true,
    })

    expect(
      hasReadPermission({
        context: humanContext,
        dataSource: "warehouse",
        tableName: "orders",
        schema: "sales",
      })
    ).toBeTruthy()

    expect(
      hasReadPermission({
        context: spContext,
        dataSource: "warehouse",
        tableName: "orders",
        schema: "sales",
      })
    ).toBeFalsy()
  })

  it("denies writes when a config-sourced entry has no matching Mutation rule", () => {
    const permissions = configPermissions([
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
    ])

    const context = createContext({ permissions, userName: "reporting-user" })

    expect(
      hasWritePermission({
        context,
        dataSource: "warehouse",
        tableName: "orders",
        schema: "sales",
      })
    ).toBeFalsy()
  })

  it("allows writes that a config-sourced Mutation rule matches", () => {
    const permissions = configPermissions([
      {
        name: "ingestion-service",
        useSystemUser: false,
        permissions: {
          Query: [],
          Mutation: [
            createPermission("warehouse", (rule) => [
              rule({ schema: "sales", tables: ["orders"] }),
            ]),
          ],
        },
      },
    ])

    const context = createContext({
      permissions,
      userName: "ingestion-service",
    })

    expect(
      hasWritePermission({
        context,
        dataSource: "warehouse",
        tableName: "orders",
        schema: "sales",
      })
    ).toBeTruthy()
  })
})
