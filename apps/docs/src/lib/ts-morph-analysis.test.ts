import { describe, expect, it } from "vitest"

import { resolvePackagePath } from "@/components/mdx/api-reference/utils"

import type { ResolvedExport, ResolvedExportMember } from "./ts-morph-analysis"
import { resolveFileExports } from "./ts-morph-analysis"

// Integration coverage for named-type link resolution on members of an inline
// object-literal parameter type. These resolve the real `@lakeql/config`
// package source via ts-morph (the same path the rendered page uses), so they
// prove `extractTypeLiteralMembers` now attaches a `typeLink` to a bare named
// type exactly like interface/type-alias members and top-level params do. The
// config source is always present under `packages/`, and the CI test job
// builds `./packages/*` before running `pnpm test`, so resolution works there.
const CONFIG_FILE = "config/src/index"

async function loadConfigExports(): Promise<ResolvedExport[]> {
  return resolveFileExports(resolvePackagePath(CONFIG_FILE))
}

function memberByName(
  members: ResolvedExportMember[] | undefined,
  name: string
): ResolvedExportMember | undefined {
  return members?.find((m) => m.name === name)
}

describe("resolveFileExports inline object-literal member links", () => {
  it("links named-type members of defineConfig's inline object-literal param", async () => {
    const exports = await loadConfigExports()

    const defineConfig = exports.find((exp) => exp.name === "defineConfig")
    const configParam = defineConfig?.signatures?.[0]?.params?.[0]

    // The `config` param is an inline object literal expanded to typeMembers.
    expect(configParam?.typeMembers).toBeDefined()

    // The reported bug: `auth: AuthConfig` must now carry a link.
    const auth = memberByName(configParam?.typeMembers, "auth")
    expect(auth?.type).toBe("AuthConfig")
    expect(auth?.typeLink).toBe("AuthConfig")

    // Sibling named-type member `dataSources` must link too.
    const dataSources = memberByName(configParam?.typeMembers, "dataSources")
    expect(dataSources?.typeLink).toBe("DataSourcesFor")
  })

  it("keeps interface members typed by a named type linking (no regression)", async () => {
    const exports = await loadConfigExports()

    // TypedLakeQLConfig.auth → AuthConfig already linked via interface members.
    const typedConfig = exports.find((exp) => exp.name === "TypedLakeQLConfig")
    const auth = memberByName(typedConfig?.members, "auth")
    expect(auth?.type).toBe("AuthConfig")
    expect(auth?.typeLink).toBe("AuthConfig")

    // AuthConfig's own members keep linking to their named types.
    const authConfig = exports.find((exp) => exp.name === "AuthConfig")
    const impersonationResolver = memberByName(
      authConfig?.members,
      "impersonationResolver"
    )
    expect(impersonationResolver?.typeLink).toBe("ImpersonationResolver")

    const permissions = memberByName(authConfig?.members, "permissions")
    expect(permissions?.typeLink).toBe("Permission")
  })

  it("does not fabricate links for primitive inline-literal members", async () => {
    const exports = await loadConfigExports()

    const defineConfig = exports.find((exp) => exp.name === "defineConfig")
    const configParam = defineConfig?.signatures?.[0]?.params?.[0]

    const sourcePath = memberByName(configParam?.typeMembers, "sourcePath")
    expect(sourcePath?.type).toBe("string")
    expect(sourcePath?.typeLink).toBeUndefined()
  })
})
