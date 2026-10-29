// oxlint-disable vitest/max-expects

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadConfig } from "../src/load-config"

/**
 * Creates a temporary directory for a real config file.
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lakeql-config-relimport-test-"))
}

/**
 * Recursively removes a directory and its contents.
 */
function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe("loadConfig extensionless relative TS imports", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    removeTempDir(tempDir)
  })

  /**
   * A scaffolded app authors `lakeql.config.ts` with extensionless relative
   * imports of sibling TypeScript modules (e.g. `import { env } from "./src/env"`).
   * c12 4.x's native `import()` loader cannot resolve these specifiers; only
   * the jiti-backed importer can. This writes such a config (a real `.ts` file,
   * not a self-contained `.mjs`) and asserts that the imported value is present
   * in the loaded result. Fails before jiti is wired in; passes after.
   */
  it("resolves a lakeql.config.ts that imports a sibling .ts via an extensionless specifier", async () => {
    fs.mkdirSync(path.join(tempDir, "src"))

    fs.writeFileSync(
      path.join(tempDir, "src", "env.ts"),
      `export const env = { adapterName: "trino-from-relative-import" }
`
    )

    const configContent = `
import { env } from "./src/env"

export default {
  dataSources: {
    warehouse: {
      adapter: env.adapterName,
      connection: {},
    },
  },
  adapters: [],
}
`
    fs.writeFileSync(path.join(tempDir, "lakeql.config.ts"), configContent)

    const result = await loadConfig({ cwd: tempDir })

    expect(result).toHaveProperty("config")
    expect(result.config.dataSources.warehouse).toBeDefined()
    expect(result.config.dataSources.warehouse?.adapter).toBe(
      "trino-from-relative-import"
    )
  })
})
