import { existsSync, readFileSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, vi, it } from "vitest"

const installPackageMock = vi.fn<() => Promise<void>>().mockResolvedValue()

// String form: the dynamic-import overload requires the full module shape,
// but this factory intentionally provides only the mocked `installPackage`.
// oxlint-disable-next-line vitest/prefer-import-in-mock
vi.mock("@antfu/install-pkg", () => ({
  installPackage: installPackageMock,
}))

const getBuildEnvMock = vi.fn<
  () => { previewSha: string; templateRef: string }
>(() => ({ previewSha: "", templateRef: "" }))

// oxlint-disable-next-line vitest/prefer-import-in-mock
vi.mock("../src/runtime/build-env", () => ({
  getBuildEnv: getBuildEnvMock,
}))

const { allowsExoticSubdeps, installDependencies } =
  await import("../src/runtime/dependencies")

function readWorkspaceYaml(dir: string): string {
  return readFileSync(path.join(dir, "pnpm-workspace.yaml"), "utf-8")
}

describe(installDependencies, () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "create-app-deps-"))
    await writeFile(path.join(dir, "package.json"), "{}")
    installPackageMock.mockClear()
    getBuildEnvMock.mockReturnValue({ previewSha: "", templateRef: "" })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("local mode skips install and writes no nested pnpm-workspace.yaml", async () => {
    await installDependencies(dir, "pnpm", true)

    expect(installPackageMock).not.toHaveBeenCalled()
    expect(existsSync(path.join(dir, "pnpm-workspace.yaml"))).toBeFalsy()
  })

  it("remote mode writes pnpm-workspace.yaml with allowBuilds for pnpm", async () => {
    await installDependencies(dir, "pnpm", false)

    expect(installPackageMock).toHaveBeenCalledOnce()
    const yaml = readWorkspaceYaml(dir)
    expect(yaml).toContain("allowBuilds:")
    expect(yaml).not.toContain("blockExoticSubdeps")
  })

  it("remote mode with npm installs without writing pnpm-workspace.yaml", async () => {
    await installDependencies(dir, "npm", false)

    expect(installPackageMock).toHaveBeenCalledOnce()
    expect(existsSync(path.join(dir, "pnpm-workspace.yaml"))).toBeFalsy()
  })

  it("preview build sets blockExoticSubdeps: false in pnpm-workspace.yaml so later pnpm commands resolve url subdeps", async () => {
    getBuildEnvMock.mockReturnValue({
      previewSha: "deadbeef",
      templateRef: "",
    })

    await installDependencies(dir, "pnpm", false)

    const yaml = readWorkspaceYaml(dir)
    expect(yaml).toContain("allowBuilds:")
    expect(yaml).toContain("blockExoticSubdeps: false")
  })

  it("preview build with npm does not write pnpm-workspace.yaml", async () => {
    getBuildEnvMock.mockReturnValue({
      previewSha: "deadbeef",
      templateRef: "",
    })

    await installDependencies(dir, "npm", false)

    expect(existsSync(path.join(dir, "pnpm-workspace.yaml"))).toBeFalsy()
  })
})

describe(allowsExoticSubdeps, () => {
  afterEach(() => {
    getBuildEnvMock.mockReturnValue({ previewSha: "", templateRef: "" })
  })

  it("is true only for pnpm in a preview build", () => {
    getBuildEnvMock.mockReturnValue({ previewSha: "abc123", templateRef: "" })
    expect(allowsExoticSubdeps("pnpm")).toBeTruthy()
    expect(allowsExoticSubdeps("npm")).toBeFalsy()
    expect(allowsExoticSubdeps("yarn")).toBeFalsy()
  })

  it("is false for pnpm in a released build", () => {
    getBuildEnvMock.mockReturnValue({ previewSha: "", templateRef: "" })
    expect(allowsExoticSubdeps("pnpm")).toBeFalsy()
  })
})
