// oxlint-disable vitest/prefer-import-in-mock

import { describe, expect, it, vi } from "vitest"

import { FABRIC_TOKEN_SCOPE, resolveCredential } from "../src/auth"
import { FabricClientError } from "../src/errors"
import type { FabricAuth } from "../src/types"

const mocks = vi.hoisted(() => {
  const clientSecretCredential = vi.fn<(...args: unknown[]) => void>()

  function ClientSecretCredential(...args: unknown[]): void {
    clientSecretCredential(...args)
  }
  ClientSecretCredential.prototype.getToken = () =>
    Promise.resolve({ token: "aad-token", expiresOnTimestamp: 0 })

  return { clientSecretCredential, ClientSecretCredential }
})

vi.mock("@azure/identity", () => ({
  ClientSecretCredential: mocks.ClientSecretCredential,
}))

describe(resolveCredential, () => {
  const oauth2Auth: Extract<FabricAuth, { type: "oauth2" }> = {
    type: "oauth2",
    tenantId: "tenant-123",
    clientId: "client-456",
    clientSecret: "secret-789",
  }

  describe("oauth2", () => {
    it("constructs a ClientSecretCredential once", () => {
      mocks.clientSecretCredential.mockClear()
      resolveCredential(oauth2Auth)
      expect(mocks.clientSecretCredential).toHaveBeenCalledOnce()
    })

    it("passes tenantId, clientId, and clientSecret in order", () => {
      mocks.clientSecretCredential.mockClear()
      resolveCredential(oauth2Auth)
      expect(mocks.clientSecretCredential).toHaveBeenCalledWith(
        "tenant-123",
        "client-456",
        "secret-789"
      )
    })

    it("returns a credential exposing getToken", () => {
      const credential = resolveCredential(oauth2Auth)
      expect(credential.getToken).toBeTypeOf("function")
    })
  })

  describe("bearer", () => {
    const bearerAuth: FabricAuth = { type: "bearer", token: "static-token" }

    it("does not construct a ClientSecretCredential", () => {
      mocks.clientSecretCredential.mockClear()
      resolveCredential(bearerAuth)
      expect(mocks.clientSecretCredential).not.toHaveBeenCalled()
    })

    it("returns the static token from getToken", async () => {
      const credential = resolveCredential(bearerAuth)
      const result = await credential.getToken(FABRIC_TOKEN_SCOPE)
      expect(result?.token).toBe("static-token")
    })

    it("sets a far-future expiry so the token never appears expired", async () => {
      const credential = resolveCredential(bearerAuth)
      const result = await credential.getToken(FABRIC_TOKEN_SCOPE)
      expect(result?.expiresOnTimestamp).toBe(Number.MAX_SAFE_INTEGER)
    })
  })

  describe("unsupported auth type", () => {
    it("throws FabricClientError", () => {
      const invalidAuth = { type: "sas" } as unknown as FabricAuth
      expect(() => resolveCredential(invalidAuth)).toThrow(FabricClientError)
    })

    it("names the offending type in the message", () => {
      const invalidAuth = { type: "sas" } as unknown as FabricAuth
      expect(() => resolveCredential(invalidAuth)).toThrow("sas")
    })
  })

  describe("token scope", () => {
    it("targets the Azure SQL / Fabric resource", () => {
      expect(FABRIC_TOKEN_SCOPE).toBe("https://database.windows.net/.default")
    })
  })
})
