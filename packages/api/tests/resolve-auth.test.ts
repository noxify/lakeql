// oxlint-disable vitest/require-mock-type-parameters
import type { ImpersonationResolver } from "@lakeql/config"
import { describe, expect, it, vi } from "vitest"

import type { ApiAuthContext } from "../src/resolve-auth"
import { createApiResolveAuth } from "../src/resolve-auth"

const authedContext: ApiAuthContext = {
  currentUser: { userName: "alice" },
  identity: { userName: "alice", isServicePrincipal: false },
}

describe(createApiResolveAuth, () => {
  describe("two-level resolution", () => {
    it("uses the per-source resolver over the global one", async () => {
      const perSource: ImpersonationResolver = vi.fn(async () => ({
        options: { impersonateAs: "from-source" },
      }))
      const global: ImpersonationResolver = vi.fn(async () => ({
        options: { impersonateAs: "from-global" },
      }))

      const resolveAuth = createApiResolveAuth({
        sources: {
          warehouse: { adapter: "trino", impersonationResolver: perSource },
        },
        globalImpersonationResolver: global,
      })

      const result = await resolveAuth("warehouse", authedContext)

      expect(result.options).toStrictEqual({ impersonateAs: "from-source" })
      expect(perSource).toHaveBeenCalledOnce()
      expect(global).not.toHaveBeenCalled()
    })

    it("falls back to the global resolver when no per-source resolver exists", async () => {
      const global: ImpersonationResolver = vi.fn(async () => ({
        options: { impersonateAs: "from-global" },
      }))

      const resolveAuth = createApiResolveAuth({
        sources: { warehouse: { adapter: "trino" } },
        globalImpersonationResolver: global,
      })

      const result = await resolveAuth("warehouse", authedContext)

      expect(result.options).toStrictEqual({ impersonateAs: "from-global" })
      expect(global).toHaveBeenCalledOnce()
    })

    it("returns an empty result when neither resolver exists", async () => {
      const resolveAuth = createApiResolveAuth({
        sources: { warehouse: { adapter: "trino" } },
      })

      const result = await resolveAuth("warehouse", authedContext)

      expect(result).toStrictEqual({})
    })
  })

  describe("resolver invocation context", () => {
    it("passes currentUser, isServicePrincipal, dataSource, and adapter", async () => {
      const resolver: ImpersonationResolver = vi.fn(async () => null)

      const resolveAuth = createApiResolveAuth({
        sources: { lakehouse: { adapter: "fabric" } },
        globalImpersonationResolver: resolver,
      })

      await resolveAuth("lakehouse", {
        currentUser: { userName: "bob" },
        identity: { userName: "bob", isServicePrincipal: true },
      })

      expect(resolver).toHaveBeenCalledWith({
        currentUser: { userName: "bob" },
        isServicePrincipal: true,
        dataSource: "lakehouse",
        adapter: "fabric",
      })
    })

    it("defaults isServicePrincipal to false when identity is null", async () => {
      const resolver: ImpersonationResolver = vi.fn(async () => null)

      const resolveAuth = createApiResolveAuth({
        sources: { warehouse: { adapter: "trino" } },
        globalImpersonationResolver: resolver,
      })

      await resolveAuth("warehouse", {
        currentUser: { userName: "carol" },
        identity: null,
      })

      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ isServicePrincipal: false })
      )
    })
  })

  describe("system user (no authenticated user)", () => {
    it("returns an empty result when currentUser is null", async () => {
      const resolver: ImpersonationResolver = vi.fn(async () => ({
        options: { impersonateAs: "x" },
      }))

      const resolveAuth = createApiResolveAuth({
        sources: { warehouse: { adapter: "trino" } },
        globalImpersonationResolver: resolver,
      })

      const result = await resolveAuth("warehouse", {
        currentUser: null,
        identity: null,
      })

      expect(result).toStrictEqual({})
      expect(resolver).not.toHaveBeenCalled()
    })
  })

  describe("pass-through of channels", () => {
    it("passes options through unchanged", async () => {
      const resolveAuth = createApiResolveAuth({
        sources: {
          warehouse: {
            adapter: "trino",
            impersonationResolver: async () => ({
              options: { impersonateAs: "alice", extra: 1 },
            }),
          },
        },
      })

      const result = await resolveAuth("warehouse", authedContext)

      expect(result.options).toStrictEqual({ impersonateAs: "alice", extra: 1 })
      expect(result.requestAuth).toBeUndefined()
    })

    it("adapts a bearer requestAuth to DataSourceAuth", async () => {
      const resolveAuth = createApiResolveAuth({
        sources: {
          lakehouse: {
            adapter: "fabric",
            impersonationResolver: async () => ({
              requestAuth: { type: "bearer", token: "obo-token" },
            }),
          },
        },
      })

      const result = await resolveAuth("lakehouse", authedContext)

      expect(result.requestAuth).toStrictEqual({
        type: "bearer",
        token: "obo-token",
      })
    })

    it("adapts an oauth2 requestAuth to an access token", async () => {
      const resolveAuth = createApiResolveAuth({
        sources: {
          lakehouse: {
            adapter: "fabric",
            impersonationResolver: async () => ({
              requestAuth: { type: "oauth2", token: "access-token" },
            }),
          },
        },
      })

      const result = await resolveAuth("lakehouse", authedContext)

      expect(result.requestAuth).toStrictEqual({
        type: "oauth2",
        accessToken: "access-token",
      })
    })

    it("throws for an unsupported requestAuth type", async () => {
      const resolveAuth = createApiResolveAuth({
        sources: {
          lakehouse: {
            adapter: "fabric",
            impersonationResolver: async () => ({
              requestAuth: { type: "kerberos", token: "x" },
            }),
          },
        },
      })

      await expect(resolveAuth("lakehouse", authedContext)).rejects.toThrow(
        "unsupported requestAuth type"
      )
    })

    it("returns empty when the resolver returns null", async () => {
      const resolveAuth = createApiResolveAuth({
        sources: {
          warehouse: {
            adapter: "trino",
            impersonationResolver: async () => null,
          },
        },
      })

      const result = await resolveAuth("warehouse", authedContext)

      expect(result).toStrictEqual({})
    })
  })

  describe("unknown data source", () => {
    it("falls back to global resolver with empty adapter name", async () => {
      const resolver: ImpersonationResolver = vi.fn(async () => null)

      const resolveAuth = createApiResolveAuth({
        sources: {},
        globalImpersonationResolver: resolver,
      })

      await resolveAuth("missing", authedContext)

      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ dataSource: "missing", adapter: "" })
      )
    })
  })
})
