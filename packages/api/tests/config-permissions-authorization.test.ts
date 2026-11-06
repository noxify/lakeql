// oxlint-disable import/first vitest/max-expects
import { describe, expect, it, vi } from "vitest"

// auth.ts reads `env`; mock it the same way the unit auth tests do so these
// assertions exercise the authorization logic, not environment loading.
// oxlint-disable-next-line vitest/prefer-import-in-mock
vi.mock("../src/env", () => ({
  env: {
    AUTH_MOCK: true,
    AUTH_MOCK_TOKEN: "test-token-123",
  },
}))

import type { Permission } from "@lakeql/config"

import { hasReadPermission, hasWritePermission } from "../src/auth"
import { createPermission } from "../src/helpers"
import type { Context } from "../src/types"

/**
 * Builds the exact `Permission[]` shape a user authors in `src/permissions.ts`
 * (via the real `createPermission` helper) and that `defineConfig` carries on
 * `auth.permissions`. The generated app's `index.ts` reads
 * `project.config.auth?.permissions` and forwards it into `defineApiConfig`,
 * from where it reaches the GraphQL context as `context.permissions`. This is
 * precisely the value asserted below — the end of the config→API flow.
 */
const configPermissions: Permission[] = [
  {
    name: "reporting-user",
    useSystemUser: false,
    permissions: {
      Query: [
        createPermission("warehouse", (rule) => [
          rule({ schema: "sales", tables: ["orders"] }),
        ]),
      ],
      Mutation: [
        createPermission("warehouse", (rule) => [
          rule({ schema: "sales", tables: ["orders"] }),
        ]),
      ],
    },
  },
]

/**
 * Builds a context carrying the config-sourced permissions, mirroring how the
 * API populates `context.permissions` from `ApiRuntimeConfig.permissions`
 * (which index.ts sets from `auth.permissions`).
 */
const contextFrom = (userName: string): Context => ({
  currentUser: { userName },
  identity: { userName, isServicePrincipal: false },
  permissions: configPermissions,
})

describe("config-declared auth.permissions reach API authorization", () => {
  it("allows a read that a config-declared Query rule matches", () => {
    const allowed = hasReadPermission({
      context: contextFrom("reporting-user"),
      dataSource: "warehouse",
      schema: "sales",
      tableName: "orders",
    })

    expect(allowed).toBeTruthy()
  })

  it("denies a read the config rule does not cover for that user", () => {
    const allowed = hasReadPermission({
      context: contextFrom("reporting-user"),
      dataSource: "warehouse",
      schema: "sales",
      tableName: "customers",
    })

    expect(allowed).toBeFalsy()
  })

  it("allows a write that a config-declared Mutation rule matches", () => {
    const allowed = hasWritePermission({
      context: contextFrom("reporting-user"),
      dataSource: "warehouse",
      schema: "sales",
      tableName: "orders",
    })

    expect(allowed).toBeTruthy()
  })

  it("denies a write the config Mutation rules do not cover", () => {
    const allowed = hasWritePermission({
      context: contextFrom("reporting-user"),
      dataSource: "warehouse",
      schema: "sales",
      tableName: "customers",
    })

    expect(allowed).toBeFalsy()
  })

  it("follows the documented human-allow fallback when no entry matches the user", () => {
    // A human user with no matching config entry is allowed to read; the data
    // source enforces its own access control. This is the empty/absent
    // fallback the generated app warns about at startup.
    const allowed = hasReadPermission({
      context: contextFrom("someone-else"),
      dataSource: "warehouse",
      schema: "sales",
      tableName: "orders",
    })

    expect(allowed).toBeTruthy()
  })

  it("follows the documented service-principal-deny fallback when no entry matches", () => {
    const allowed = hasReadPermission({
      context: {
        currentUser: { userName: "sp-client" },
        identity: { userName: "sp-client", isServicePrincipal: true },
        permissions: configPermissions,
      },
      dataSource: "warehouse",
      schema: "sales",
      tableName: "orders",
    })

    expect(allowed).toBeFalsy()
  })
})
