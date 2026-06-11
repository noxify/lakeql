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

import { defineConfig } from "../src/config"
import type { Permission } from "../src/types"

const configs = [
  { catalog: "hive", schema: "tier1_lake", tableName: "users" },
  { catalog: "hive", schema: "tier1_lake", tableName: "orders" },
] as const

describe(defineConfig, () => {
  describe("with array input", () => {
    it("returns object with allConfigs equal to the input", () => {
      const result = defineConfig(configs)
      expect(result.allConfigs).toStrictEqual(configs)
    })

    it("has createYogaServer method", () => {
      const result = defineConfig(configs)
      expect(result.createYogaServer).toBeTypeOf("function")
    })

    it("has startServer method", () => {
      const result = defineConfig(configs)
      expect(result.startServer).toBeTypeOf("function")
    })

    it("does not include runtime config options", () => {
      const result = defineConfig(configs)
      expect(result.maxRecordsPerPage).toBeUndefined()
      expect(result.permissions).toBeUndefined()
      expect(result.baseDir).toBeUndefined()
      expect(result.port).toBeUndefined()
      expect(result.getUser).toBeUndefined()
    })
  })

  describe("with object input", () => {
    const permissions: Permission[] = [
      {
        name: "admin",
        useSystemUser: false,
        permissions: {
          Query: [{ catalog: "hive", schema: "tier1_lake", tables: ["*"] }],
          Mutation: [],
        },
      },
    ]

    const objectInput = {
      allConfigs: configs,
      maxRecordsPerPage: 500,
      permissions,
    }

    it("returns object with allConfigs from input", () => {
      const result = defineConfig(objectInput)
      expect(result.allConfigs).toStrictEqual(configs)
    })

    it("returns object with maxRecordsPerPage", () => {
      const result = defineConfig(objectInput)
      expect(result.maxRecordsPerPage).toBe(500)
    })

    it("returns object with permissions array", () => {
      const result = defineConfig(objectInput)
      expect(result.permissions).toStrictEqual(permissions)
    })

    it("has createYogaServer method", () => {
      const result = defineConfig(objectInput)
      expect(result.createYogaServer).toBeTypeOf("function")
    })

    it("has startServer method", () => {
      const result = defineConfig(objectInput)
      expect(result.startServer).toBeTypeOf("function")
    })
  })

  describe("createYogaServer factory method", () => {
    it("calls the mocked createYogaServer from ./yoga when invoked", async () => {
      const result = defineConfig(configs)
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
      } as unknown as Parameters<typeof result.createYogaServer>[0]

      await result.createYogaServer(mockLogger)

      expect(mockCreateYogaServer).toHaveBeenCalledWith(mockLogger, {})
    })

    it("passes runtime config to createYogaServer", async () => {
      const objectInput = {
        allConfigs: configs,
        maxRecordsPerPage: 250,
        port: 4000,
      }
      const result = defineConfig(objectInput)
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
      } as unknown as Parameters<typeof result.createYogaServer>[0]

      await result.createYogaServer(mockLogger)

      expect(mockCreateYogaServer).toHaveBeenCalledWith(
        mockLogger,
        expect.objectContaining({
          maxRecordsPerPage: 250,
          port: 4000,
        })
      )
    })
  })

  describe("startServer method", () => {
    it("calls the mocked startApiServer from ./server when invoked", async () => {
      const result = defineConfig(configs)

      await result.startServer()

      expect(mockStartApiServer).toHaveBeenCalledWith({})
    })

    it("passes runtime config to startApiServer", async () => {
      const objectInput = {
        allConfigs: configs,
        maxRecordsPerPage: 100,
        port: 3000,
      }
      const result = defineConfig(objectInput)

      await result.startServer()

      expect(mockStartApiServer).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRecordsPerPage: 100,
          port: 3000,
        })
      )
    })
  })
})
