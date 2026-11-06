// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable import/first
import type {
  ImpersonationResolver,
  LakeQLRuntime,
  LoadedLakeQLProject,
  Permission,
} from "@lakeql/config"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockClose,
  mockStartServer,
  mockRuntime,
  mockCreateLakeQLRuntime,
  mockLoadConfig,
  mockCreateApiResolveAuth,
  mockResolveAuth,
  mockDefineApiConfig,
} = vi.hoisted(() => {
  const close = vi.fn().mockResolvedValue(undefined)
  const startServer = vi.fn().mockResolvedValue(undefined)
  const runtime = { close } as unknown as LakeQLRuntime
  const resolveAuth = vi.fn()
  return {
    mockClose: close,
    mockStartServer: startServer,
    mockRuntime: runtime,
    mockCreateLakeQLRuntime: vi.fn().mockResolvedValue(runtime),
    mockLoadConfig: vi.fn(),
    mockCreateApiResolveAuth: vi.fn().mockReturnValue(resolveAuth),
    mockResolveAuth: resolveAuth,
    mockDefineApiConfig: vi
      .fn()
      .mockImplementation((input: Record<string, unknown>) => ({
        ...input,
        startServer,
      })),
  }
})

vi.mock(import("@lakeql/config"), async (importOriginal) => ({
  ...(await importOriginal()),
  createLakeQLRuntime: mockCreateLakeQLRuntime,
  loadConfig: mockLoadConfig,
}))
vi.mock(import("../src/resolve-auth"), () => ({
  createApiResolveAuth: mockCreateApiResolveAuth,
}))
vi.mock(import("../src/config"), () => ({
  defineApiConfig: mockDefineApiConfig,
}))

import { createLakeQLApp, EMPTY_PERMISSIONS_WARNING } from "../src/create-app"

const resolver: ImpersonationResolver = vi.fn()

function makeProject(
  overrides: Partial<LoadedLakeQLProject["config"]> = {}
): LoadedLakeQLProject {
  return {
    adapters: [],
    config: {
      sourcePath: "src",
      dataSources: {
        warehouse: {
          adapter: "trino",
          connection: {},
          paging: { defaultPerPage: 20, maxRecordsPerPage: 2000 },
          impersonationResolver: resolver,
        },
      },
      ...overrides,
    },
  } as unknown as LoadedLakeQLProject
}

describe(createLakeQLApp, () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let exitSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    process.removeAllListeners("SIGTERM")
    process.removeAllListeners("SIGINT")
  })

  describe("wiring", () => {
    it("derives the per-source map and global resolver from the config", async () => {
      const globalResolver: ImpersonationResolver = vi.fn()
      const project = makeProject({
        auth: { impersonationResolver: globalResolver },
      })

      await createLakeQLApp({ project, handleSignals: false })

      expect(mockCreateApiResolveAuth).toHaveBeenCalledWith({
        sources: {
          warehouse: { adapter: "trino", impersonationResolver: resolver },
        },
        globalImpersonationResolver: globalResolver,
      })
    })

    it("builds the runtime from the config, adapters, and resolveAuth", async () => {
      const project = makeProject()

      await createLakeQLApp({ project, handleSignals: false })

      expect(mockCreateLakeQLRuntime).toHaveBeenCalledWith({
        config: project.config,
        adapters: project.adapters,
        resolveAuth: mockResolveAuth,
      })
    })

    it("calls loadConfig when no project is provided", async () => {
      mockLoadConfig.mockResolvedValueOnce(makeProject())

      await createLakeQLApp({ handleSignals: false })

      expect(mockLoadConfig).toHaveBeenCalledOnce()
    })

    it("forwards every defineApiConfig option through", async () => {
      const project = makeProject()
      const tokenResolver = vi.fn()
      const identityResolver = vi.fn()
      const hasReadPermission = vi.fn()
      const hasWritePermission = vi.fn()
      const cors = { origin: "https://app.example.com" }
      const onError = vi.fn()
      const yogaConfig = { maskedErrors: false }

      await createLakeQLApp({
        project,
        handleSignals: false,
        tokenResolver,
        identityResolver,
        hasReadPermission,
        hasWritePermission,
        cors,
        onError,
        yogaConfig,
        port: 5000,
        baseDir: "/app",
        schemaPath: "./schemas",
        graphqlPath: "/gql",
        healthCheckEndpoint: "/healthz",
      })

      expect(mockDefineApiConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          runtime: mockRuntime,
          tokenResolver,
          identityResolver,
          hasReadPermission,
          hasWritePermission,
          cors,
          onError,
          yogaConfig,
          port: 5000,
          baseDir: "/app",
          schemaPath: "./schemas",
          graphqlPath: "/gql",
          healthCheckEndpoint: "/healthz",
        })
      )
    })
  })

  describe("permissions", () => {
    const permissions: Permission[] = [
      {
        name: "admin",
        useSystemUser: false,
        permissions: { Query: [], Mutation: [] },
      },
    ]

    it("defaults permissions from the loaded config", async () => {
      const project = makeProject({ auth: { permissions } })

      await createLakeQLApp({ project, handleSignals: false })

      expect(mockDefineApiConfig).toHaveBeenCalledWith(
        expect.objectContaining({ permissions })
      )
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it("lets an explicit permissions option override the config", async () => {
      const project = makeProject({ auth: { permissions: [] } })

      await createLakeQLApp({ project, handleSignals: false, permissions })

      expect(mockDefineApiConfig).toHaveBeenCalledWith(
        expect.objectContaining({ permissions })
      )
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it("warns when the effective permission set is empty", async () => {
      const project = makeProject()

      await createLakeQLApp({ project, handleSignals: false })

      expect(warnSpy).toHaveBeenCalledWith(EMPTY_PERMISSIONS_WARNING)
    })
  })

  describe("lifecycle", () => {
    it("exposes the runtime and a close() that closes it", async () => {
      const project = makeProject()

      const app = await createLakeQLApp({ project, handleSignals: false })

      expect(app.runtime).toBe(mockRuntime)
      await app.close()
      expect(mockClose).toHaveBeenCalledOnce()
    })

    it("registers SIGTERM/SIGINT handlers when handleSignals is true (default)", async () => {
      const onSpy = vi.spyOn(process, "on")
      const project = makeProject()

      await createLakeQLApp({ project })

      const signals = onSpy.mock.calls.map((call) => call[0])
      expect(signals).toContain("SIGTERM")
      expect(signals).toContain("SIGINT")
    })

    it("does not register signal handlers when handleSignals is false", async () => {
      const onSpy = vi.spyOn(process, "on")
      const project = makeProject()

      await createLakeQLApp({ project, handleSignals: false })

      const signals = onSpy.mock.calls.map((call) => call[0])
      expect(signals).not.toContain("SIGTERM")
      expect(signals).not.toContain("SIGINT")
    })
  })

  describe("start", () => {
    it("starts the composed server", async () => {
      const project = makeProject()

      const app = await createLakeQLApp({ project, handleSignals: false })
      await app.start()

      expect(mockStartServer).toHaveBeenCalledOnce()
    })

    it("prints the message and exits non-zero on startup failure", async () => {
      mockStartServer.mockRejectedValueOnce(new Error("no schema files yet"))
      const project = makeProject()

      const app = await createLakeQLApp({ project, handleSignals: false })
      await app.start()

      expect(errorSpy).toHaveBeenCalledWith("no schema files yet")
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })
})
