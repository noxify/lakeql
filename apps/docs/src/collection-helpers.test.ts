import { describe, expect, it } from "vitest"

import { getApiReferenceExports } from "./collection-helpers"

// Integration coverage for `getApiReferenceExports`, the source of the link
// validator's allowed anchors. It resolves the real `@lakeql/config` package
// source via ts-morph (cwd is `apps/docs`, so `../../packages` is the repo
// `packages/` directory), proving the validator's anchor set stays in parity
// with the rendered page: an excluded export must not surface as an allowed
// anchor. The config source is always present under `packages/`, and the CI
// test job builds `./packages/*` before running `pnpm test`.
const CONFIG_REFERENCE = { name: "@lakeql/config", file: "config/src/index" }
const EXCLUDED = "OverridesFor"

describe(getApiReferenceExports, () => {
  it("omits an excluded export and its anchor", async () => {
    const [result] = await getApiReferenceExports([
      { ...CONFIG_REFERENCE, exclude: [EXCLUDED] },
    ])

    expect(result).toBeDefined()
    const names = result?.exports.map((exp) => exp.name) ?? []
    const slugs = result?.exports.map((exp) => exp.slug) ?? []

    // The excluded symbol contributes neither an export entry nor an anchor,
    // so the link validator cannot treat `#overrides-for` as a valid target.
    expect(names).not.toContain(EXCLUDED)
    expect(slugs).not.toContain("overrides-for")

    // Other public exports (and their anchors) are untouched.
    expect(names).toContain("defineConfig")
    expect(slugs).toContain("define-config")
  })

  it("keeps every export when no exclude is given (backward compatible)", async () => {
    const [result] = await getApiReferenceExports([CONFIG_REFERENCE])

    expect(result).toBeDefined()
    const names = result?.exports.map((exp) => exp.name) ?? []

    expect(names).toContain(EXCLUDED)
    expect(names).toContain("defineConfig")
  })
})
