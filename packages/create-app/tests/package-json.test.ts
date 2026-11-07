import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface GeneratedPackageJson {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  name: string
}

async function writeTemplatePackageJson(dir: string) {
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({
      dependencies: {
        "@lakeql/api": "workspace:*",
        dedent: "workspace:*",
      },
      devDependencies: { "@lakeql/cli": "workspace:*" },
      name: "lakeql-app",
      private: true,
    })
  )
}

async function readGeneratedPackageJson(dir: string) {
  return JSON.parse(
    await readFile(path.join(dir, "package.json"), "utf-8")
  ) as GeneratedPackageJson
}

describe("updatePackageJson (preview SHA)", () => {
  let dir: string
  let mockFetch: ReturnType<
    typeof vi.fn<(input: string | URL | Request) => Promise<Response>>
  >

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "create-app-preview-"))
    await writeTemplatePackageJson(dir)

    mockFetch = vi.fn<(input: string | URL | Request) => Promise<Response>>()
    mockFetch.mockResolvedValue({
      json: async () => ({ version: "9.9.9" }),
      ok: true,
    } as Response)
    vi.stubGlobal("fetch", mockFetch)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("rewrites @lakeql/* workspace deps to pkg.pr.new URLs, leaving other deps on npm latest", async () => {
    vi.stubGlobal("__LAKEQL_PKG_SHA__", "abc1234")
    const { updatePackageJson } = await import("../src/runtime/package-json")

    await updatePackageJson(dir, "my-app", {}, {}, false)
    const pkg = await readGeneratedPackageJson(dir)

    expect(pkg.dependencies["@lakeql/api"]).toBe(
      "https://pkg.pr.new/noxify/lakeql/@lakeql/api@abc1234"
    )
    expect(pkg.devDependencies["@lakeql/cli"]).toBe(
      "https://pkg.pr.new/noxify/lakeql/@lakeql/cli@abc1234"
    )
    expect(pkg.dependencies.dedent).toBe("^9.9.9")
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it("resolves every workspace dep via npm latest when no preview SHA is injected", async () => {
    const { updatePackageJson } = await import("../src/runtime/package-json")

    await updatePackageJson(dir, "my-app", {}, {}, false)
    const pkg = await readGeneratedPackageJson(dir)

    expect(pkg.dependencies["@lakeql/api"]).toBe("^9.9.9")
    expect(pkg.dependencies.dedent).toBe("^9.9.9")
    expect(pkg.devDependencies["@lakeql/cli"]).toBe("^9.9.9")
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it("keeps workspace:* unchanged in local/dev mode regardless of the preview SHA", async () => {
    vi.stubGlobal("__LAKEQL_PKG_SHA__", "abc1234")
    const { updatePackageJson } = await import("../src/runtime/package-json")

    await updatePackageJson(dir, "my-app", {}, {}, true)
    const pkg = await readGeneratedPackageJson(dir)

    expect(pkg.dependencies["@lakeql/api"]).toBe("workspace:*")
    expect(pkg.dependencies.dedent).toBe("workspace:*")
    expect(pkg.devDependencies["@lakeql/cli"]).toBe("workspace:*")
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
