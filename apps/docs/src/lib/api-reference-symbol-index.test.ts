import { describe, expect, it } from "vitest"

import type { SymbolLocation } from "./api-reference-symbol-index"
import { indexReferenceExports } from "./api-reference-symbol-index"

const PAGE = "/docs/packages/config/api-reference"

// Unit coverage for the symbol-index insertion that `buildSymbolIndex` applies
// per `apiReference` frontmatter entry. This pins the exclusion contract
// without the full renoun docs-tree scan `buildSymbolIndex` performs: an
// excluded export must not be indexed to its page, so a `{@link}` to it later
// resolves to null (plain text) instead of a dead same-page anchor.
describe(indexReferenceExports, () => {
  it("skips excluded exports so they are never indexed", () => {
    const index = new Map<string, SymbolLocation>()

    indexReferenceExports(
      index,
      [{ name: "defineConfig" }, { name: "OverridesFor" }],
      PAGE,
      ["OverridesFor"]
    )

    expect(index.has("OverridesFor")).toBeFalsy()
    expect(index.get("defineConfig")).toStrictEqual({
      pageHref: PAGE,
      anchor: "define-config",
    })
  })

  it("indexes every export when no exclude is given", () => {
    const index = new Map<string, SymbolLocation>()

    indexReferenceExports(
      index,
      [{ name: "defineConfig" }, { name: "OverridesFor" }],
      PAGE
    )

    expect(index.has("OverridesFor")).toBeTruthy()
    expect(index.has("defineConfig")).toBeTruthy()
  })

  it("keeps the first page for a duplicate symbol name", () => {
    const index = new Map<string, SymbolLocation>()

    indexReferenceExports(index, [{ name: "Shared" }], PAGE)
    indexReferenceExports(index, [{ name: "Shared" }], "/docs/other/page")

    expect(index.get("Shared")?.pageHref).toBe(PAGE)
  })
})
