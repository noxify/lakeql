import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

/**
 * End-to-end check for `fabric-obo`, mirroring the real user flow:
 * `create-lakeql-app` scaffolds a Fabric project, then `lakeql-cli add
 * fabric-obo` applies the feature — the exact binaries a user runs, invoked
 * as real subprocesses against the `dist/` output CI builds before running
 * tests (`.github/workflows/tests.yml` runs `pnpm --filter "./packages/*"
 * build` before `pnpm test`).
 *
 * This file intentionally never type-checks the generated project: doing so
 * needs the project's dependency types installed (`@azure/identity`, `zod`,
 * `@t3-oss/env-core`, `@lakeql/config`), which no CI job installs and never
 * will (see `.kiro/skills/fabric-obo-typecheck/SKILL.md` for that manual
 * check).
 *
 * Subprocess output is captured with `NO_COLOR=1` so assertions never have
 * to deal with ANSI escape codes: the CLI's output formatting
 * (`highlightTsLine`/`colors` in `packages/cli/src/output-format.ts` and
 * `packages/logger/src/console.ts`) uses `kleur`, which disables color
 * whenever `NO_COLOR` is set — overriding the Tests workflow's `FORCE_COLOR:
 * 3`, which would otherwise leak escape codes into piped output and break
 * substring assertions.
 */

const CREATE_APP_BIN = fileURLToPath(
  new URL("../../create-app/dist/index.mjs", import.meta.url)
)
const CLI_BIN = fileURLToPath(
  new URL("../../cli/dist/cli.mjs", import.meta.url)
)
const LOCAL_TEMPLATE_DIR = fileURLToPath(
  new URL("../../../templates/app", import.meta.url)
)

/**
 * Deterministic, colorless env for every subprocess, with `INIT_CWD`
 * stripped. `INIT_CWD` is a package-manager runtime variable (npm/pnpm) that
 * both `create-app` (`invocationCwd()`) and the CLI (`getInvocationCwd()`)
 * prefer over `process.cwd()` when resolving relative paths and the `add`
 * command's project directory. Running under `pnpm test`/`pnpm --filter`
 * sets `INIT_CWD` on *this* process to the pnpm invocation directory (e.g.
 * the repo root), and that value would otherwise leak into every subprocess
 * via the `...process.env` spread below — making the CLI resolve the
 * project directory as the inherited `INIT_CWD` instead of the `cwd` option
 * passed to `execFileSync`, so `lakeql-cli add` would fail with "No
 * package.json found" in the wrong directory. Removing it makes each
 * subprocess fall back to its own `process.cwd()`, i.e. the `cwd` option
 * below — confirmed against a live repro.
 */
// oxlint-disable-next-line no-restricted-properties
const { INIT_CWD: _initCwd, ...ENV_WITHOUT_INIT_CWD } = process.env
const SUBPROCESS_ENV = { ...ENV_WITHOUT_INIT_CWD, NO_COLOR: "1" }

/**
 * Turn a missing-dist `ENOENT` into an actionable message. CI always builds
 * every package before running tests; running this file in isolation
 * without that build step is the only way to hit this.
 */
function assertBuilt(bin: string, label: string): void {
  if (!existsSync(bin)) {
    throw new Error(
      `${label} is not built (${bin} missing). Run \`pnpm --filter "./packages/*" build\` first.`
    )
  }
}

/** Run `lakeql-cli add fabric-obo` against `projectDir`, as a user would. */
function addFabricObo(projectDir: string): string {
  return execFileSync(process.execPath, [CLI_BIN, "add", "fabric-obo"], {
    cwd: projectDir,
    env: SUBPROCESS_ENV,
    stdio: "pipe",
  }).toString("utf-8")
}

describe("fabric-obo end-to-end", () => {
  let parentDir: string
  let projectDir: string

  beforeAll(() => {
    assertBuilt(CREATE_APP_BIN, "@lakeql/create-app")
    assertBuilt(CLI_BIN, "@lakeql/cli")
  })

  beforeEach(() => {
    parentDir = mkdtempSync(path.join(tmpdir(), "fabric-obo-e2e-"))
    projectDir = path.join(parentDir, "fabric-e2e")

    // Scaffold exactly like a user running `create-lakeql-app` with the
    // Fabric adapter. `--local` (absolute path) keeps `workspace:*`
    // dependency versions and copies the real starter template;
    // `--no-install` skips the install (nothing here needs node_modules).
    // `--ds-names`/`--auth` avoid interactive prompts.
    execFileSync(
      process.execPath,
      [
        CREATE_APP_BIN,
        "fabric-e2e",
        "--adapters",
        "fabric",
        "--ds-names",
        "fabric",
        "--auth",
        "mock",
        "--target-dir",
        parentDir,
        "--local",
        LOCAL_TEMPLATE_DIR,
        "--no-install",
        "--quiet",
      ],
      { cwd: parentDir, env: SUBPROCESS_ENV, stdio: "pipe" }
    )
  }, 30_000)

  afterEach(() => {
    rmSync(parentDir, { recursive: true, force: true })
  })

  it("applies fabric-obo and prints the guidance to wire it up", () => {
    const stdout = addFabricObo(projectDir)

    // Auto-applied: resolver file, dependency, and .env.example keys.
    expect(
      existsSync(
        path.join(projectDir, "src", "fabric-impersonation-resolver.ts")
      )
    ).toBeTruthy()

    const pkg = JSON.parse(
      readFileSync(path.join(projectDir, "package.json"), "utf-8")
    ) as { dependencies: Record<string, string> }
    expect(pkg.dependencies["@azure/identity"]).toBe("4.14.0")

    const envExample = readFileSync(
      path.join(projectDir, ".env.example"),
      "utf-8"
    )
    for (const key of [
      "OBO_CLIENT_ID",
      "OBO_CLIENT_SECRET",
      "OBO_FABRIC_SCOPE",
      "OBO_TENANT_ID",
    ]) {
      expect(envExample).toContain(`${key}=`)
    }

    // Guidance-only: the printed "Next steps" tell the user exactly what
    // to add to the two user-authored files this feature never writes to
    // directly.
    for (const guidanceLine of [
      "OBO_CLIENT_ID: string().min(1),",
      "OBO_CLIENT_SECRET: string().min(1),",
      'OBO_FABRIC_SCOPE: string().default("https://database.windows.net/.default"),',
      "OBO_TENANT_ID: string().min(1),",
      'import { fabricImpersonationResolver } from "./src/fabric-impersonation-resolver"',
    ]) {
      expect(stdout).toContain(guidanceLine)
    }
  }, 30_000)

  it("is a no-op when the command is run a second time", () => {
    addFabricObo(projectDir)

    const pkgAfterFirst = readFileSync(
      path.join(projectDir, "package.json"),
      "utf-8"
    )
    const envAfterFirst = readFileSync(
      path.join(projectDir, ".env.example"),
      "utf-8"
    )
    const resolverAfterFirst = readFileSync(
      path.join(projectDir, "src", "fabric-impersonation-resolver.ts"),
      "utf-8"
    )

    const stdout = addFabricObo(projectDir)

    expect(stdout).toContain(
      "skipped file src/fabric-impersonation-resolver.ts (already exists)"
    )
    expect(readFileSync(path.join(projectDir, "package.json"), "utf-8")).toBe(
      pkgAfterFirst
    )
    expect(readFileSync(path.join(projectDir, ".env.example"), "utf-8")).toBe(
      envAfterFirst
    )
    expect(
      readFileSync(
        path.join(projectDir, "src", "fabric-impersonation-resolver.ts"),
        "utf-8"
      )
    ).toBe(resolverAfterFirst)
  }, 30_000)
})
