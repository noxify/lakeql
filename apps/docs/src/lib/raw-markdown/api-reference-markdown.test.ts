import { describe, expect, it } from "vitest"

import { apiReferenceToMarkdown } from "./api-reference-markdown"
import { mdxToMarkdown } from "./index"

// Integration coverage for the frontmatter `apiReference[].exclude` capability.
//
// These resolve the real `@lakeql/config` package source via ts-morph (the
// same path the rendered page and the search index use), so they prove the
// raw/llms Markdown has parity with the page: an excluded export must be absent
// from the appended Markdown, while every other export stays. The config
// source is always present under `packages/`, and the CI test job builds
// `./packages/*` before running `pnpm test`, so resolution works there.
const CONFIG_FILE = "config/src/index"
const EXCLUDED = "OverridesFor"

describe("apiReferenceToMarkdown exclude", () => {
  it("renders the excluded export when no exclude is given", async () => {
    const markdown = await apiReferenceToMarkdown({ file: CONFIG_FILE })

    // Baseline: without `exclude`, OverridesFor has its own section.
    expect(markdown).toContain(`### ${EXCLUDED}`)
    // Sanity: a well-known public export is present.
    expect(markdown).toContain("### defineConfig")
  })

  it("omits the excluded export and keeps the rest", async () => {
    const markdown = await apiReferenceToMarkdown({
      file: CONFIG_FILE,
      exclude: [EXCLUDED],
    })

    // The excluded symbol has no standalone section anywhere in the output.
    expect(markdown).not.toContain(`### ${EXCLUDED}`)
    // Other exports are untouched.
    expect(markdown).toContain("### defineConfig")
    expect(markdown).toContain("### loadConfig")
  })

  it("drops the excluded symbol from a `See:` referenced-types line", async () => {
    const withExclude = await apiReferenceToMarkdown({
      file: CONFIG_FILE,
      exclude: [EXCLUDED],
    })
    const without = await apiReferenceToMarkdown({ file: CONFIG_FILE })

    // Baseline: some type definition's `See:` list names OverridesFor, matching
    // the rendered page's referenced-types links.
    expect(
      without
        .split("\n")
        .some((line) => line.startsWith("See:") && line.includes(EXCLUDED))
    ).toBeTruthy()

    // After exclusion no `See:` line may name the dropped symbol, so the raw
    // Markdown (and the search index) never deep-links to a removed section —
    // the same guarantee the rendered page now makes via stripExcludedTypeLinks.
    expect(
      withExclude
        .split("\n")
        .some((line) => line.startsWith("See:") && line.includes(EXCLUDED))
    ).toBeFalsy()
  })

  it("is a no-op for an empty exclude list", async () => {
    const withEmpty = await apiReferenceToMarkdown({
      file: CONFIG_FILE,
      exclude: [],
    })
    const without = await apiReferenceToMarkdown({ file: CONFIG_FILE })

    expect(withEmpty).toBe(without)
    expect(withEmpty).toContain(`### ${EXCLUDED}`)
  })
})

describe("mdxToMarkdown appendApiReferences exclude", () => {
  const SOURCE = `---
title: Config API
---

Body paragraph.
`

  it("forwards exclude so the appended reference omits the symbol", async () => {
    const markdown = await mdxToMarkdown(SOURCE, {
      appendApiReferences: [
        { name: "@lakeql/config", file: CONFIG_FILE, exclude: [EXCLUDED] },
      ],
    })

    expect(markdown).toContain("Body paragraph.")
    expect(markdown).not.toContain(`### ${EXCLUDED}`)
    expect(markdown).toContain("### defineConfig")
  })

  it("keeps the symbol when no exclude is set (backward compatible)", async () => {
    const markdown = await mdxToMarkdown(SOURCE, {
      appendApiReferences: [{ name: "@lakeql/config", file: CONFIG_FILE }],
    })

    expect(markdown).toContain(`### ${EXCLUDED}`)
  })
})
