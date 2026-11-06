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
  return fs.mkdtempSync(path.join(os.tmpdir(), "lakeql-config-tspaths-test-"))
}

/**
 * Recursively removes a directory and its contents.
 */
function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe("loadConfig tsconfig path aliases", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    removeTempDir(tempDir)
  })

  /**
   * A scaffolded app's `tsconfig.json` defines a path alias (the template uses
   * `"~/*": ["./src/*"]`), so authoring `import { ... } from "~/permissions"`
   * in `lakeql.config.ts` typechecks and the editor autocompletes it. jiti does
   * not resolve tsconfig `paths` by default, so the loader previously failed
   * with "Cannot find module '~/permissions'". With `tsconfigPaths: true` jiti
   * auto-discovers the project's tsconfig and resolves the alias at load time.
   * Fails before the fix; passes after.
   */
  it("resolves a lakeql.config.ts that imports via a tsconfig paths alias", async () => {
    fs.mkdirSync(path.join(tempDir, "src"))

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            moduleResolution: "Bundler",
            paths: {
              "~/*": ["./src/*"],
            },
          },
          include: ["src", "lakeql.config.ts"],
        },
        null,
        2
      )
    )

    fs.writeFileSync(
      path.join(tempDir, "src", "permissions.ts"),
      `export const permissions = { adapterName: "trino-from-alias-import" }
`
    )

    const configContent = `
import { permissions } from "~/permissions"

export default {
  dataSources: {
    warehouse: {
      adapter: permissions.adapterName,
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
      "trino-from-alias-import"
    )
  })
})
