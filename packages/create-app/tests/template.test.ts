import { afterEach, describe, expect, it, vi } from "vitest"

const downloadMock = vi.fn<() => Promise<void>>().mockResolvedValue()

// String form: the dynamic-import overload requires the full module shape,
// but this factory intentionally provides only the mocked `downloadTemplate`.
// oxlint-disable-next-line vitest/prefer-import-in-mock
vi.mock("giget", () => ({
  downloadTemplate: downloadMock,
}))

describe("downloadTemplate (remote mode)", () => {
  afterEach(() => {
    downloadMock.mockClear()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("downloads the ref-less source without force when no template ref is injected", async () => {
    const { downloadTemplate } = await import("../src/runtime/template")

    await downloadTemplate("/tmp/out")

    expect(downloadMock).toHaveBeenCalledExactlyOnceWith(
      "github:noxify/lakeql/templates/app",
      { dir: "/tmp/out", force: false, offline: false }
    )
  })

  it("downloads a pinned ref with force: true when a template ref is injected", async () => {
    vi.stubGlobal("__TEMPLATE_REF__", "feat/my-branch")
    const { downloadTemplate } = await import("../src/runtime/template")

    await downloadTemplate("/tmp/out")

    expect(downloadMock).toHaveBeenCalledExactlyOnceWith(
      "github:noxify/lakeql/templates/app#feat/my-branch",
      { dir: "/tmp/out", force: true, offline: false }
    )
  })
})
