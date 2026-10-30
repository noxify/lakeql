import type { AddDepsOp, AddEnvVarsOp, AddFileOp } from "@lakeql/scaffold"
import { describe, expect, it } from "vitest"

import { opsForAuth } from "../src/features/auth"

function authFileContent(ops: ReturnType<typeof opsForAuth>): string {
  const fileOp = ops.find(
    (op): op is AddFileOp => op.type === "addFile" && op.path === "src/auth.ts"
  )
  if (!fileOp) {
    throw new Error("no src/auth.ts addFile op emitted")
  }
  return fileOp.content
}

function authEnvKeys(ops: ReturnType<typeof opsForAuth>): string[] {
  return ops
    .filter((op): op is AddEnvVarsOp => op.type === "addEnvVars")
    .flatMap((op) => Object.keys(op.vars))
}

describe(opsForAuth, () => {
  it("mock strategy generates auth.ts importing TokenResolver from @lakeql/config", () => {
    const content = authFileContent(opsForAuth("mock"))

    expect(content).toContain(
      'import type { TokenResolver } from "@lakeql/config"'
    )
    // The wrong pre-restart path must not reappear.
    expect(content).not.toContain("@lakeql/api/types")
    expect(content).toContain("export const tokenResolver: TokenResolver")
  })

  it("mock strategy emits only the mock env vars", () => {
    const keys = authEnvKeys(opsForAuth("mock"))

    expect(keys).toStrictEqual(["AUTH_MOCK", "AUTH_MOCK_TOKEN"])
    expect(keys).not.toContain("AUTH_TENANT_ID")
  })

  it("entra-id strategy emits tenant + client id vars, no mock vars or fallback", () => {
    const ops = opsForAuth("entra-id")
    const keys = authEnvKeys(ops)

    expect(keys).toStrictEqual(["AUTH_TENANT_ID", "AUTH_CLIENT_ID"])
    expect(keys).not.toContain("AUTH_MOCK")

    // The generated resolver must not reference mock env vars anymore.
    const content = authFileContent(ops)
    expect(content).not.toContain("AUTH_MOCK")
  })

  it("entra-id resolver verifies audience and issuer", () => {
    const content = authFileContent(opsForAuth("entra-id"))

    expect(content).toContain("audience: env.AUTH_CLIENT_ID")
    expect(content).toContain("issuer:")
    expect(content).toContain("/v2.0")
  })

  it("custom strategy generates a typed boilerplate resolver with no env vars or deps", () => {
    const ops = opsForAuth("custom")
    const content = authFileContent(ops)

    expect(content).toContain(
      'import type { TokenResolver } from "@lakeql/config"'
    )
    expect(content).toContain("export const tokenResolver: TokenResolver")
    expect(content).toContain("TODO")

    // No auth-specific env vars and no added deps for the custom strategy.
    expect(authEnvKeys(ops)).toStrictEqual([])
    expect(ops.some((op) => op.type === "addDeps")).toBeFalsy()
  })

  it("auth env vars are grouped under a strategy-specific label", () => {
    const mockGroup = opsForAuth("mock").find(
      (op): op is AddEnvVarsOp => op.type === "addEnvVars"
    )?.group
    const entraGroup = opsForAuth("entra-id").find(
      (op): op is AddEnvVarsOp => op.type === "addEnvVars"
    )?.group

    expect(mockGroup).toBe("Authentication - Mock")
    expect(entraGroup).toBe("Authentication - Entra ID")
  })

  it("entra-id strategy generates auth.ts from @lakeql/config and adds jose", () => {
    const ops = opsForAuth("entra-id")
    const content = authFileContent(ops)

    expect(content).toContain(
      'import type { TokenResolver } from "@lakeql/config"'
    )
    expect(content).not.toContain("@lakeql/api/types")
    expect(content).toContain("jwtVerify")

    const depsOp = ops.find(
      (op): op is AddDepsOp => op.type === "addDeps" && "jose" in op.deps
    )
    expect(depsOp).toBeDefined()
  })
})
