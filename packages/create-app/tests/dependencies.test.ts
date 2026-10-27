import { existsSync } from "node:fs"
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

const { installDependencies } = await import("../src/runtime/dependencies")

describe(installDependencies, () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "create-app-deps-"))
    await writeFile(path.join(dir, "package.json"), "{}")
    installPackageMock.mockClear()
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("local mode skips install and writes no nested pnpm-workspace.yaml", async () => {
    await installDependencies(dir, "pnpm", true)

    expect(installPackageMock).not.toHaveBeenCalled()
    expect(existsSync(path.join(dir, "pnpm-workspace.yaml"))).toBeFalsy()
  })

  it("remote mode installs and writes pnpm-workspace.yaml for pnpm", async () => {
    await installDependencies(dir, "pnpm", false)

    expect(installPackageMock).toHaveBeenCalledOnce()
    expect(existsSync(path.join(dir, "pnpm-workspace.yaml"))).toBeTruthy()
  })

  it("remote mode with npm installs without writing pnpm-workspace.yaml", async () => {
    await installDependencies(dir, "npm", false)

    expect(installPackageMock).toHaveBeenCalledOnce()
    expect(existsSync(path.join(dir, "pnpm-workspace.yaml"))).toBeFalsy()
  })
})
