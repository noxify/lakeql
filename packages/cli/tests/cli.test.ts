import { spawnSync } from "node:child_process"
import path from "node:path"

import { describe, expect, test } from "vitest"

describe("CLI entrypoint", () => {
  test("exits successfully when invoked without arguments", () => {
    const projectRoot = path.resolve(import.meta.dirname, "..")
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts"],
      {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 10_000,
      }
    )

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("LakeQL CLI")
  })
})
