import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { resolvePackagePath } from "./utils"

// Pins the cwd-independence of the package-path resolver. `resolvePackagePath`
// must point at the real in-repo `packages/<file>.ts` no matter what the
// current working directory is — the CI `pnpm test` job runs from the repo
// root, where the old `process.cwd()`-relative resolution escaped the repo and
// made the api-reference helpers silently fall back. Asserting the resolved
// path exists on disk is the check that only passes when resolution is correct.
describe("package path resolution", () => {
  it("resolves to a real file under the repo packages directory from any cwd", () => {
    const resolved = resolvePackagePath("config/src/index")

    // Absolute, inside a `packages/` directory, and actually present on disk.
    expect(path.isAbsolute(resolved)).toBeTruthy()
    expect(resolved.replaceAll(path.sep, "/")).toContain(
      "/packages/config/src/index.ts"
    )
    expect(fs.existsSync(resolved)).toBeTruthy()
  })
})
