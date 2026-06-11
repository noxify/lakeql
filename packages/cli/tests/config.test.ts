// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable import/first
import path from "node:path"

import { afterEach, describe, expect, test, vi } from "vitest"

const { mockGetInvocationCwd } = vi.hoisted(() => ({
  mockGetInvocationCwd: vi.fn(() => "/mock/project"),
}))

vi.mock(import("../src/path-utils"), () => ({
  getInvocationCwd: mockGetInvocationCwd,
}))

vi.mock(import("node:fs"), () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

import { existsSync, readFileSync } from "node:fs"

import { CONFIG_FILE_NAME, loadConfig, resolveSourcePath } from "../src/config"

describe("CONFIG_FILE_NAME constant", () => {
  test("is lakeql.config.json", () => {
    expect(CONFIG_FILE_NAME).toBe("lakeql.config.json")
  })
})

describe(loadConfig, () => {
  afterEach(() => {
    vi.mocked(existsSync).mockReset()
    vi.mocked(readFileSync).mockReset()
  })

  test("returns default config when config file does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const config = loadConfig()
    expect(config).toStrictEqual({ sourcePath: "." })
  })

  test("parses config file when it exists", () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ sourcePath: "src" })
    )

    const config = loadConfig()
    expect(config).toStrictEqual({ sourcePath: "src" })
  })

  test("merges with defaults for partial config", () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}))

    const config = loadConfig()
    expect(config).toStrictEqual({ sourcePath: "." })
  })
})

describe(resolveSourcePath, () => {
  afterEach(() => {
    vi.mocked(existsSync).mockReset()
    vi.mocked(readFileSync).mockReset()
  })

  test("uses CLI override when provided as absolute path", () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const result = resolveSourcePath("/absolute/override")
    expect(result).toBe("/absolute/override")
  })

  test("resolves relative CLI override from invocation cwd", () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const result = resolveSourcePath("custom/path")
    expect(result).toBe(path.resolve("/mock/project", "custom/path"))
  })

  test("falls back to config sourcePath when no CLI override", () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ sourcePath: "src" })
    )

    const result = resolveSourcePath()
    expect(result).toBe(path.resolve("/mock/project", "src"))
  })

  test("uses default sourcePath when config file not found and no override", () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const result = resolveSourcePath()
    expect(result).toBe(path.resolve("/mock/project", "."))
  })
})
