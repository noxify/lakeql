// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable import/first
import { describe, expect, it, vi } from "vitest"

const { mockCreateYogaServer, mockStartApiServer } = vi.hoisted(() => ({
  mockCreateYogaServer: vi.fn().mockResolvedValue({
    fetch: vi.fn(),
    graphqlEndpoint: "/graphql",
  }),
  mockStartApiServer: vi.fn().mockResolvedValue(null),
}))

vi.mock(import("../src/yoga"), () => ({
  createYogaServer: mockCreateYogaServer,
}))
vi.mock(import("../src/server"), () => ({
  startApiServer: mockStartApiServer,
}))

import type { Permission } from "@lakeql/config"

import { defineApiConfig } from "../src/config"

describe(defineApiConfig, () => {
  describe("with minimal input", () => {
    it("exposes a createYogaServer method", () => {
      const result = defineApiConfig({})
      expect(result.createYogaServer).toBeTypeOf("function")
    })

    it("exposes a startServer method", () => {
      const result = defineApiConfig({})
      expect(result.startServer).toBeTypeOf("function")
    })

    it("leaves unspecified runtime options undefined", () => {
      const result = defineApiConfig({})
      expect(result.permissions).toBeUndefined()
      expect(result.baseDir).toBeUndefined()
      expect(result.port).toBeUndefined()
    })
  })

  describe("with full runtime config", () => {
    const permissions: Permission[] = [
      {
        name: "admin",
        useSystemUser: false,
        permissions: {
          Query: [
            {
              dataSource: "warehouse",
              rules: [{ catalog: "hive", schema: "tier1_lake", tables: ["*"] }],
            },
          ],
          Mutation: [],
        },
      },
    ]

    it("passes through the permissions array", () => {
      const result = defineApiConfig({ permissions })
      expect(result.permissions).toStrictEqual(permissions)
    })

    it("passes through port and schemaPath", () => {
      const result = defineApiConfig({ port: 4000, schemaPath: "./schema" })
      expect(result.port).toBe(4000)
      expect(result.schemaPath).toBe("./schema")
    })

    it("passes through the cors option", () => {
      const cors = { origin: "https://app.example.com" }
      const result = defineApiConfig({ cors })
      expect(result.cors).toStrictEqual(cors)
    })
  })

  describe("createYogaServer factory method", () => {
    it("calls the mocked createYogaServer from ./yoga when invoked", async () => {
      const result = defineApiConfig({})
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
      } as unknown as Parameters<typeof result.createYogaServer>[0]

      await result.createYogaServer(mockLogger)

      expect(mockCreateYogaServer).toHaveBeenCalledWith(
        mockLogger,
        expect.any(Object)
      )
    })

    it("passes runtime config to createYogaServer", async () => {
      const result = defineApiConfig({ port: 4000 })
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
      } as unknown as Parameters<typeof result.createYogaServer>[0]

      await result.createYogaServer(mockLogger)

      expect(mockCreateYogaServer).toHaveBeenCalledWith(
        mockLogger,
        expect.objectContaining({
          port: 4000,
        })
      )
    })
  })

  describe("startServer method", () => {
    it("calls the mocked startApiServer from ./server when invoked", async () => {
      const result = defineApiConfig({})

      await result.startServer()

      expect(mockStartApiServer).toHaveBeenCalledWith(expect.any(Object))
    })

    it("passes runtime config to startApiServer", async () => {
      const result = defineApiConfig({ port: 3000 })

      await result.startServer()

      expect(mockStartApiServer).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 3000,
        })
      )
    })

    it("passes the runtime through to startApiServer", async () => {
      const runtime = { getReadStrategy: vi.fn() } as unknown as Parameters<
        typeof defineApiConfig
      >[0]["runtime"]

      const result = defineApiConfig({ runtime })

      await result.startServer()

      expect(mockStartApiServer).toHaveBeenCalledWith(
        expect.objectContaining({ runtime })
      )
    })
  })
})
