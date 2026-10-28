import { afterEach, describe, expect, it, vi } from "vitest"

describe("getBuildEnv", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("resolves both values to empty strings when the bundler define is absent", async () => {
    const { getBuildEnv } = await import("../src/runtime/build-env")

    expect(getBuildEnv()).toStrictEqual({ previewSha: "", templateRef: "" })
  })

  it("reads injected values when the bundler define constants are set", async () => {
    vi.stubGlobal("__TEMPLATE_REF__", "feat/my-branch")
    vi.stubGlobal("__LAKEQL_PKG_SHA__", "abc1234")
    const { getBuildEnv } = await import("../src/runtime/build-env")

    expect(getBuildEnv()).toStrictEqual({
      previewSha: "abc1234",
      templateRef: "feat/my-branch",
    })
  })
})
