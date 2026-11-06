import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Symmetry guard: the "eject" example in the `createLakeQLApp` docs must stay
 * the expanded form of the wrapper's own wiring. The docs page claims the eject
 * block runs the same steps in the same order as `createLakeQLApp`; nothing in
 * the build pins that claim, so this test extracts the eject code block and
 * checks the behavior-defining fragments against `create-app.ts`. If the
 * wrapper changes how it derives sources, resolves auth, builds the runtime, or
 * warns on empty permissions, this test fails until the docs are updated.
 */

const repoRoot = path.resolve(import.meta.dirname, "../../../..")

const ejectDocPath = path.join(
  repoRoot,
  "apps/docs/content/api/02.server-setup/04.create-lakeql-app.mdx"
)
const wrapperSourcePath = path.join(repoRoot, "packages/api/src/create-app.ts")

/** Collapse all runs of whitespace so comparisons ignore formatting. */
function normalize(code: string): string {
  return code.replaceAll(/\s+/gu, " ").trim()
}

/** Extract the code fence under the `## Eject` heading. */
function extractEjectBlock(mdx: string): string {
  const [, ejectSection] = mdx.split("## Eject")
  expect(ejectSection, "docs page must have an ## Eject section").toBeDefined()
  const match = /```ts\n(?<code>[\s\S]*?)```/u.exec(ejectSection ?? "")
  expect(match, "eject section must contain a ts code block").not.toBeNull()
  const code = match?.groups?.code
  expect(code, "eject code block must be non-empty").toBeTruthy()
  return code ?? ""
}

describe("createLakeQLApp eject symmetry", () => {
  const ejectBlock = extractEjectBlock(readFileSync(ejectDocPath, "utf-8"))
  const wrapperSource = readFileSync(wrapperSourcePath, "utf-8")

  const normalizedEject = normalize(ejectBlock)
  const normalizedWrapper = normalize(wrapperSource)

  it("derives the per-source map the same way the wrapper does", () => {
    const sourcesFragment = normalize(`Object.fromEntries(
      Object.entries(project.config.dataSources).map(([name, definition]) => [
        name,
        {
          adapter: definition.adapter,
          impersonationResolver: definition.impersonationResolver,
        },
      ])
    )`)

    expect(normalizedWrapper).toContain(sourcesFragment)
    expect(normalizedEject).toContain(sourcesFragment)
  })

  it("builds resolveAuth the same way the wrapper does", () => {
    const resolveAuthFragment = normalize(`createApiResolveAuth({
      sources,
      globalImpersonationResolver: project.config.auth?.impersonationResolver,
    })`)

    expect(normalizedWrapper).toContain(resolveAuthFragment)
    expect(normalizedEject).toContain(resolveAuthFragment)
  })

  it("composes the runtime the same way the wrapper does", () => {
    const runtimeFragment = normalize(`createLakeQLRuntime({
      config: project.config,
      adapters: project.adapters,
      resolveAuth,
    })`)

    expect(normalizedWrapper).toContain(runtimeFragment)
    expect(normalizedEject).toContain(runtimeFragment)
  })

  it("warns with the shared EMPTY_PERMISSIONS_WARNING constant, never an inline literal", () => {
    // Both the wrapper and the eject block must emit the exported constant, so
    // the warning wording cannot drift between code and docs.
    expect(normalizedWrapper).toContain(
      "console.warn(EMPTY_PERMISSIONS_WARNING)"
    )
    expect(normalizedEject).toContain("console.warn(EMPTY_PERMISSIONS_WARNING)")

    // The eject block must import the constant rather than re-declare the text.
    expect(ejectBlock).toContain(
      'import { EMPTY_PERMISSIONS_WARNING } from "@lakeql/api/create-app"'
    )
  })

  it("defaults permissions from config and warns on an empty set, in that order", () => {
    const permissionsFragment =
      normalize(`const permissions = project.config.auth?.permissions ?? []
    if (permissions.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(EMPTY_PERMISSIONS_WARNING)
    }`)

    // The wrapper also honors an explicit override before the config default,
    // so match only the config-default tail that the eject block reproduces.
    expect(normalizedEject).toContain(permissionsFragment)
    expect(normalizedWrapper).toContain(
      normalize(`if (permissions.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(EMPTY_PERMISSIONS_WARNING)
    }`)
    )
  })

  it("reproduces the SIGTERM/SIGINT shutdown that closes before exit", () => {
    expect(normalizedEject).toContain(
      normalize(`process.on("SIGTERM", shutdown)
    process.on("SIGINT", shutdown)`)
    )
    expect(normalizedWrapper).toContain(
      normalize(`process.on("SIGTERM", shutdown)
    process.on("SIGINT", shutdown)`)
    )

    // Shutdown closes the runtime (via close()) then exits zero.
    expect(normalizedEject).toContain(
      normalize(`await close()
      process.exit(0)`)
    )
    expect(normalizedWrapper).toContain(
      normalize(`await close()
      process.exit(0)`)
    )
  })

  it("reproduces the start-time error handling (print message, exit non-zero)", () => {
    const startErrorFragment =
      normalize(`console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)`)

    expect(normalizedEject).toContain(startErrorFragment)
    expect(normalizedWrapper).toContain(startErrorFragment)
  })
})
