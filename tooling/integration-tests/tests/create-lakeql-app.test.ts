import * as apiConfig from "@lakeql/api/config"
import { createLakeQLApp } from "@lakeql/api/create-app"
import type { LoadedLakeQLProject, Permission } from "@lakeql/config"
import { FakeAdapterFactory } from "@lakeql/datasource/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Acceptance proof that `createLakeQLApp` from `@lakeql/api` composes a real
 * runtime and API server end to end across the config boundary — not against
 * mocks.
 *
 * `createLakeQLApp` calls the real `createLakeQLRuntime` from `@lakeql/config`,
 * which `@lakeql/api` depends on but which `packages/api`'s own unit tests mock
 * out. This private, non-published tooling package devDepends on both packages
 * plus `@lakeql/datasource` (for `FakeAdapterFactory`), so it can drive the
 * actual composition path a generated app runs: a loaded project with a fake
 * adapter flows through `loadConfig` → `createApiResolveAuth` →
 * `createLakeQLRuntime` → `defineApiConfig`, and the returned
 * `{ runtime, start, close }` works against the real runtime instance.
 */

/**
 * Build a `LoadedLakeQLProject` with one fake-adapter data source. Mirrors the
 * shape `loadConfig()` returns, so it can be handed to `createLakeQLApp` via
 * the `project` option without touching disk.
 */
function makeProject(): LoadedLakeQLProject {
  const factory = new FakeAdapterFactory()
  return {
    adapters: [factory],
    config: {
      sourcePath: "src",
      dataSources: {
        warehouse: {
          adapter: "fake",
          connection: {},
          paging: { defaultPerPage: 20, maxRecordsPerPage: 2000 },
        },
      },
    },
  } as unknown as LoadedLakeQLProject
}

describe("createLakeQLApp end-to-end composition", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.removeAllListeners("SIGTERM")
    process.removeAllListeners("SIGINT")
  })

  it("composes a real runtime that resolves strategies for the configured source", async () => {
    const app = await createLakeQLApp({
      project: makeProject(),
      handleSignals: false,
    })

    // The runtime is the real composition output: it resolves the read
    // strategy for the configured source name created from the fake adapter.
    const readStrategy = app.runtime.getReadStrategy("warehouse")
    expect(readStrategy.read).toBeTypeOf("function")

    await app.close()
  })

  it("close() releases the composed runtime", async () => {
    const app = await createLakeQLApp({
      project: makeProject(),
      handleSignals: false,
    })

    const closeSpy = vi.spyOn(app.runtime, "close")

    await app.close()

    expect(closeSpy).toHaveBeenCalledOnce()
  })

  it("forwards config-sourced permissions into the composed server", async () => {
    const permissions: Permission[] = [
      {
        name: "reporting-user",
        useSystemUser: false,
        permissions: { Query: [], Mutation: [] },
      },
    ]
    const project = makeProject()
    project.config.auth = { permissions }
    const warnSpy = vi.spyOn(console, "warn")
    // Spy on the real defineApiConfig to capture what the full composition path
    // hands the server — proving permissions reach defineApiConfig, not just
    // that no warning fired.
    const defineApiConfigSpy = vi.spyOn(apiConfig, "defineApiConfig")

    const app = await createLakeQLApp({ project, handleSignals: false })

    // Non-empty config permissions: no empty-permissions warning fires.
    expect(warnSpy).not.toHaveBeenCalled()
    // The config-sourced rules reached defineApiConfig through the real path.
    expect(defineApiConfigSpy).toHaveBeenCalledWith(
      expect.objectContaining({ permissions })
    )
    // And they survive onto the resolved server config unchanged.
    expect(defineApiConfigSpy.mock.results[0]?.value).toMatchObject({
      permissions,
    })

    await app.close()
  })
})
