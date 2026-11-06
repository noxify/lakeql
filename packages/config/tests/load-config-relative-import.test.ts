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

  /**
   * Acceptance proof for the wired `auth.permissions` surface. The generated
   * app authors permission rules in `src/permissions.ts`, imports them into
   * `lakeql.config.ts` via an extensionless relative specifier, and sets them
   * on `defineConfig({ auth: { permissions } })`. The application wiring
   * (index.ts) reads `project.config.auth?.permissions` and forwards them to
   * the API. This writes that exact shape and asserts the authored rules
   * survive the loadConfig round-trip at `config.auth.permissions` — i.e. the
   * value the wiring hands to `defineApiConfig` is present. This surface was
   * previously dead (nothing read it); the assertion closes that gap.
   */
  it("surfaces auth.permissions imported from a sibling ./src/permissions module", async () => {
    fs.mkdirSync(path.join(tempDir, "src"))

    fs.writeFileSync(
      path.join(tempDir, "src", "permissions.ts"),
      `export const permissions = [
  {
    name: "testuser",
    useSystemUser: false,
    permissions: {
      Query: [{ dataSource: "warehouse", rules: [{ schema: "sales", tables: ["orders"] }] }],
      Mutation: [],
    },
  },
]
`
    )

    const configContent = `
import { permissions } from "./src/permissions"

export default {
  dataSources: {},
  adapters: [],
  auth: { permissions },
}
`
    fs.writeFileSync(path.join(tempDir, "lakeql.config.ts"), configContent)

    const result = await loadConfig({ cwd: tempDir })

    const loaded = result.config.auth?.permissions
    expect(loaded).toBeDefined()
    expect(loaded).toHaveLength(1)
    expect(loaded?.[0]?.name).toBe("testuser")
    expect(loaded?.[0]?.permissions.Query[0]?.dataSource).toBe("warehouse")
  })
})
