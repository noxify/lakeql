// oxlint-disable vitest/require-mock-type-parameters
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

let testDir: string

const mockGetInvocationCwd = vi.fn(() => testDir)
const mockC12LoadConfig = vi.fn()

vi.mock(import("c12"), () => ({
  loadConfig: (...args: unknown[]) => mockC12LoadConfig(...args),
}))

vi.mock(import("@/path-utils"), () => ({
  getInvocationCwd: () => mockGetInvocationCwd(),
  resolveFromInvocationCwd: (p: string) =>
    path.isAbsolute(p) ? p : path.resolve(mockGetInvocationCwd(), p),
}))

describe("loadConfig JSON fallback", () => {
  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `config-json-fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )

    await mkdir(testDir, { recursive: true })
    mockC12LoadConfig.mockReset()
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test("falls back to lakeql.config.json when c12 fails with import-attribute error", async () => {
    await writeFile(
      path.join(testDir, "lakeql.config.json"),
      JSON.stringify({ sourcePath: "src" })
    )

    const importError = Object.assign(
      new Error(
        'Module ".../lakeql.config.json" needs an import attribute of "type: json"'
      ),
      {
        cause: { code: "ERR_IMPORT_ATTRIBUTE_MISSING" },
      }
    )

    mockC12LoadConfig.mockRejectedValueOnce(importError)

    const { loadConfig } = await import("../src/config")

    await expect(loadConfig()).resolves.toStrictEqual({ sourcePath: "src" })
  })

  test("rethrows non JSON import errors from c12", async () => {
    mockC12LoadConfig.mockRejectedValueOnce(new Error("boom"))

    const { loadConfig } = await import("../src/config")

    await expect(loadConfig()).rejects.toThrow("boom")
  })
})
