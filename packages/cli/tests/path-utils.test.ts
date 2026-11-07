import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { getInvocationCwd, resolveFromInvocationCwd } from "../src/path-utils"

describe(getInvocationCwd, () => {
  afterEach(() => {
    // oxlint-disable-next-line no-restricted-properties
    delete process.env.INIT_CWD
  })

  it("returns INIT_CWD when set", () => {
    // oxlint-disable-next-line no-restricted-properties
    process.env.INIT_CWD = "/custom/path"
    expect(getInvocationCwd()).toBe("/custom/path")
  })

  it("returns process.cwd() when INIT_CWD is not set", () => {
    // oxlint-disable-next-line no-restricted-properties
    delete process.env.INIT_CWD
    expect(getInvocationCwd()).toBe(process.cwd())
  })
})

describe(resolveFromInvocationCwd, () => {
  afterEach(() => {
    // oxlint-disable-next-line no-restricted-properties
    delete process.env.INIT_CWD
  })

  it("returns absolute path unchanged", () => {
    const absPath = "/absolute/path/to/file"
    expect(resolveFromInvocationCwd(absPath)).toBe(absPath)
  })

  it("resolves relative path from invocation cwd", () => {
    // oxlint-disable-next-line no-restricted-properties
    process.env.INIT_CWD = "/my/project"
    const result = resolveFromInvocationCwd("src/config.ts")
    expect(result).toBe(path.resolve("/my/project", "src/config.ts"))
  })

  it("resolves relative path from process.cwd() when INIT_CWD not set", () => {
    // oxlint-disable-next-line no-restricted-properties
    delete process.env.INIT_CWD
    const result = resolveFromInvocationCwd("relative/path")
    expect(result).toBe(path.resolve(process.cwd(), "relative/path"))
  })
})
