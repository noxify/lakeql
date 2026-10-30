import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  invocationCwd,
  resolveLocalTemplateDir,
  resolveTargetDir,
} from "../src/runtime/local-template"
import { updatePackageJson } from "../src/runtime/package-json"
import { downloadTemplate } from "../src/runtime/template"

describe(resolveLocalTemplateDir, () => {
  const cwd = "/repo"

  it("returns undefined when the flag is absent or false", () => {
    expect(resolveLocalTemplateDir(undefined, cwd)).toBeUndefined()
    expect(resolveLocalTemplateDir(false, cwd)).toBeUndefined()
  })

  it("defaults to <cwd>/templates/app when passed true", () => {
    expect(resolveLocalTemplateDir(true, cwd)).toBe("/repo/templates/app")
  })

  it("resolves an explicit path against cwd", () => {
    expect(resolveLocalTemplateDir("some/tpl", cwd)).toBe("/repo/some/tpl")
    expect(resolveLocalTemplateDir("/abs/tpl", cwd)).toBe("/abs/tpl")
  })
})

describe(resolveTargetDir, () => {
  const cwd = "/repo"

  it("defaults to <cwd>/<project> when no target dir is given", () => {
    expect(resolveTargetDir(undefined, "my-app", cwd)).toBe("/repo/my-app")
  })

  it("nests the project under a relative target dir", () => {
    expect(resolveTargetDir("examples", "my-app", cwd)).toBe(
      "/repo/examples/my-app"
    )
  })

  it("resolves an absolute target dir", () => {
    expect(resolveTargetDir("/abs/out", "my-app", cwd)).toBe("/abs/out/my-app")
  })
})

// INIT_CWD is a package-manager runtime variable; these tests manipulate it
// directly to exercise the invocation-cwd resolution.
/* oxlint-disable no-restricted-properties */
describe(invocationCwd, () => {
  const original = process.env.INIT_CWD

  afterEach(() => {
    if (original === undefined) {
      delete process.env.INIT_CWD
    } else {
      process.env.INIT_CWD = original
    }
  })

  it("prefers INIT_CWD (the user's shell directory) when set", () => {
    process.env.INIT_CWD = "/user/shell/dir"
    expect(invocationCwd()).toBe("/user/shell/dir")
  })

  it("falls back to process.cwd() when INIT_CWD is unset", () => {
    delete process.env.INIT_CWD
    expect(invocationCwd()).toBe(process.cwd())
  })

  it("relative --local and --target-dir resolve against INIT_CWD by default", () => {
    process.env.INIT_CWD = "/user/shell/dir"
    expect(resolveLocalTemplateDir("templates/app")).toBe(
      "/user/shell/dir/templates/app"
    )
    expect(resolveTargetDir("examples", "my-app")).toBe(
      "/user/shell/dir/examples/my-app"
    )
  })
})
/* oxlint-enable no-restricted-properties */

describe("downloadTemplate (local mode)", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "create-app-local-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("copies a local template dir and skips node_modules/dist", async () => {
    const source = path.join(root, "template")
    await mkdir(path.join(source, "src"), { recursive: true })
    await mkdir(path.join(source, "node_modules", "x"), { recursive: true })
    await mkdir(path.join(source, "dist"), { recursive: true })
    await writeFile(
      path.join(source, "package.json"),
      JSON.stringify({ name: "lakeql-app" })
    )
    await writeFile(path.join(source, "src", "index.ts"), "// entry")
    await writeFile(path.join(source, "node_modules", "x", "y.js"), "junk")
    await writeFile(path.join(source, "dist", "index.mjs"), "built")

    const target = path.join(root, "out")
    await downloadTemplate(target, source)

    expect(existsSync(path.join(target, "package.json"))).toBeTruthy()
    expect(existsSync(path.join(target, "src", "index.ts"))).toBeTruthy()
    expect(existsSync(path.join(target, "node_modules"))).toBeFalsy()
    expect(existsSync(path.join(target, "dist"))).toBeFalsy()
  })

  it("throws when the local dir is missing", async () => {
    await expect(
      downloadTemplate(path.join(root, "out"), path.join(root, "nope"))
    ).rejects.toThrow(/not found/u)
  })

  it("throws when the local dir has no package.json", async () => {
    const source = path.join(root, "empty")
    await mkdir(source, { recursive: true })
    await expect(
      downloadTemplate(path.join(root, "out"), source)
    ).rejects.toThrow(/no package\.json/u)
  })
})

describe("updatePackageJson (keepWorkspaceVersions)", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "create-app-pkg-"))
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "lakeql-app",
        private: true,
        dependencies: {
          "@lakeql/api": "workspace:*",
          "@lakeql/config": "workspace:*",
          "@lakeql/adapter-trino": "workspace:*",
          "@lakeql/adapter-fabric": "workspace:*",
        },
        devDependencies: { "@lakeql/cli": "workspace:*" },
      })
    )
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function runKeepWorkspace() {
    await updatePackageJson(
      dir,
      "my-app",
      { "@lakeql/adapter-trino": "workspace:*" },
      {},
      true
    )
    return JSON.parse(
      await readFile(path.join(dir, "package.json"), "utf-8")
    ) as {
      name: string
      private?: boolean
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
  }

  it("preserves workspace:* versions (no npm resolution)", async () => {
    const pkg = await runKeepWorkspace()

    expect(pkg.dependencies["@lakeql/api"]).toBe("workspace:*")
    expect(pkg.dependencies["@lakeql/adapter-trino"]).toBe("workspace:*")
    expect(pkg.devDependencies["@lakeql/cli"]).toBe("workspace:*")
  })

  it("filters unselected adapters and sets name (drops private)", async () => {
    const pkg = await runKeepWorkspace()

    expect(pkg.name).toBe("my-app")
    expect(pkg.private).toBeUndefined()
    expect(pkg.dependencies["@lakeql/adapter-fabric"]).toBeUndefined()
  })

  it("writes dependencies and devDependencies sorted alphabetically", async () => {
    const pkg = await runKeepWorkspace()

    const depKeys = Object.keys(pkg.dependencies)
    const devKeys = Object.keys(pkg.devDependencies)

    expect(depKeys).toStrictEqual(
      depKeys.toSorted((a, b) => a.localeCompare(b))
    )
    expect(devKeys).toStrictEqual(
      devKeys.toSorted((a, b) => a.localeCompare(b))
    )
  })
})
