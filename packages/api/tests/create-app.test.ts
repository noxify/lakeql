// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable import/first
import type {
  ImpersonationResolver,
  LakeQLRuntime,
  LoadedLakeQLProject,
  Permission,
} from "@lakeql/config"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ApiRuntimeConfig } from "../src/config"
import type { CreateLakeQLAppOptions } from "../src/create-app"

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

/**
 * Compile-time guard: every forwardable `ApiRuntimeConfig` option (all fields
 * except the wrapper-built `runtime`) must be expressible as a
 * {@link CreateLakeQLAppOptions} key, so a new `defineApiConfig` option cannot
 * be silently dropped from the wrapper's surface. If `ApiRuntimeConfig` grows a
 * field, this assignment fails to type-check until the wrapper forwards it.
 */
type ForwardableKey = keyof Omit<ApiRuntimeConfig, "runtime">
const _forwardableKeysCovered: Record<ForwardableKey, true> = {
  tokenResolver: true,
  identityResolver: true,
  hasReadPermission: true,
  hasWritePermission: true,
  yogaConfig: true,
  cors: true,
  permissions: true,
  baseDir: true,
  schemaPath: true,
  graphqlPath: true,
  healthCheckEndpoint: true,
  port: true,
  onError: true,
}
// Each covered key must also be a valid wrapper option.
const _forwardableKeysAreOptions: Record<
  keyof typeof _forwardableKeysCovered,
  keyof CreateLakeQLAppOptions
> = {
  tokenResolver: "tokenResolver",
  identityResolver: "identityResolver",
  hasReadPermission: "hasReadPermission",
  hasWritePermission: "hasWritePermission",
  yogaConfig: "yogaConfig",
  cors: "cors",
  permissions: "permissions",
  baseDir: "baseDir",
  schemaPath: "schemaPath",
  graphqlPath: "graphqlPath",
  healthCheckEndpoint: "healthCheckEndpoint",
  port: "port",
  onError: "onError",
}
void _forwardableKeysCovered
void _forwardableKeysAreOptions

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

    it("forwards every defineApiConfig option through, exactly", async () => {
      const project = makeProject()
      const tokenResolver = vi.fn()
      const identityResolver = vi.fn()
      const hasReadPermission = vi.fn()
      const hasWritePermission = vi.fn()
      const cors = { origin: "https://app.example.com" }
      const onError = vi.fn()
      const yogaConfig = { maskedErrors: false }
      const permissions: Permission[] = [
        {
          name: "admin",
          useSystemUser: false,
          permissions: { Query: [], Mutation: [] },
        },
      ]

      // Every forwardable ApiRuntimeConfig option, set at once. `rest` must
      // reach defineApiConfig verbatim — no field added, dropped, or renamed —
      // alongside the wrapper-built runtime. Exact-equality (not
      // objectContaining) is what catches a silently dropped future option.
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
        permissions,
        port: 5000,
        baseDir: "/app",
        schemaPath: "./schemas",
        graphqlPath: "/gql",
        healthCheckEndpoint: "/healthz",
      })

      expect(mockDefineApiConfig).toHaveBeenCalledOnce()
      expect(mockDefineApiConfig.mock.calls[0]?.[0]).toStrictEqual({
        runtime: mockRuntime,
        tokenResolver,
        identityResolver,
        hasReadPermission,
        hasWritePermission,
        cors,
        onError,
        yogaConfig,
        permissions,
        port: 5000,
        baseDir: "/app",
        schemaPath: "./schemas",
        graphqlPath: "/gql",
        healthCheckEndpoint: "/healthz",
      })
    })

    it("does not leak project or handleSignals into defineApiConfig", async () => {
      const beforeTerm = new Set(process.listeners("SIGTERM"))
      const beforeInt = new Set(process.listeners("SIGINT"))
      const project = makeProject({
        auth: {
          permissions: [
            {
              name: "admin",
              useSystemUser: false,
              permissions: { Query: [], Mutation: [] },
            },
          ],
        },
      })

      await createLakeQLApp({ project, handleSignals: true })

      const arg = mockDefineApiConfig.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >
      expect(arg).not.toHaveProperty("project")
      expect(arg).not.toHaveProperty("handleSignals")

      // Only drop the listeners this test added — never the runner's.
      for (const listener of process
        .listeners("SIGTERM")
        .filter((entry) => !beforeTerm.has(entry))) {
        process.removeListener("SIGTERM", listener)
      }
      for (const listener of process
        .listeners("SIGINT")
        .filter((entry) => !beforeInt.has(entry))) {
        process.removeListener("SIGINT", listener)
      }
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
      const beforeTerm = new Set(process.listeners("SIGTERM"))
      const beforeInt = new Set(process.listeners("SIGINT"))
      const project = makeProject()

      await createLakeQLApp({ project })

      const addedTerm = process
        .listeners("SIGTERM")
        .filter((listener) => !beforeTerm.has(listener))
      const addedInt = process
        .listeners("SIGINT")
        .filter((listener) => !beforeInt.has(listener))
      expect(addedTerm).toHaveLength(1)
      expect(addedInt).toHaveLength(1)

      // Only remove the listeners this test added — never the runner's.
      for (const listener of addedTerm) {
        process.removeListener("SIGTERM", listener)
      }
      for (const listener of addedInt) {
        process.removeListener("SIGINT", listener)
      }
    })

    it("the registered handler closes the runtime then exits zero", async () => {
      const beforeTerm = new Set(process.listeners("SIGTERM"))
      const beforeInt = new Set(process.listeners("SIGINT"))
      const project = makeProject()

      await createLakeQLApp({ project })

      const handler = process
        .listeners("SIGTERM")
        .find((listener) => !beforeTerm.has(listener))
      expect(handler).toBeTypeOf("function")

      await (handler as () => Promise<void>)()

      expect(mockClose).toHaveBeenCalledOnce()
      expect(exitSpy).toHaveBeenCalledWith(0)

      // Drop only the handlers this test added, on both signals.
      for (const listener of process
        .listeners("SIGTERM")
        .filter((entry) => !beforeTerm.has(entry))) {
        process.removeListener("SIGTERM", listener)
      }
      for (const listener of process
        .listeners("SIGINT")
        .filter((entry) => !beforeInt.has(entry))) {
        process.removeListener("SIGINT", listener)
      }
    })

    it("does not register signal handlers when handleSignals is false", async () => {
      const beforeTerm = new Set(process.listeners("SIGTERM"))
      const beforeInt = new Set(process.listeners("SIGINT"))
      const project = makeProject()

      await createLakeQLApp({ project, handleSignals: false })

      const addedTerm = process
        .listeners("SIGTERM")
        .filter((listener) => !beforeTerm.has(listener))
      const addedInt = process
        .listeners("SIGINT")
        .filter((listener) => !beforeInt.has(listener))
      expect(addedTerm).toHaveLength(0)
      expect(addedInt).toHaveLength(0)
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
