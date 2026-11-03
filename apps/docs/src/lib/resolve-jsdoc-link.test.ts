import { describe, expect, it } from "vitest"

import type { SymbolIndex } from "./api-reference-symbol-index"
import { resolveJsDocLinkHref } from "./resolve-jsdoc-link"

// Mirrors the real index for the two live acceptance cases from the bug report:
// `AdapterFactory` is a `@lakeql/datasource` export documented on the
// data-sources overview page; `FabricConnectionConfig` is an adapter-fabric
// export documented on the fabric page. Anchors are `createSlug(name)`.
const index: SymbolIndex = new Map([
  [
    "AdapterFactory",
    {
      pageHref: "/docs/data-sources/overview/api-reference",
      anchor: "adapter-factory",
    },
  ],
  [
    "FabricConnectionConfig",
    {
      pageHref: "/docs/data-sources/fabric/api-reference",
      anchor: "fabric-connection-config",
    },
  ],
  [
    "FabricDataSource",
    {
      pageHref: "/docs/data-sources/fabric/api-reference",
      anchor: "fabric-data-source",
    },
  ],
])

const FABRIC_PAGE = "/docs/data-sources/fabric/api-reference"

describe(resolveJsDocLinkHref, () => {
  it("resolves a cross-package {@link} to the owning page + anchor", () => {
    // {@link AdapterFactory} rendered on the fabric page must jump to the
    // overview page where AdapterFactory is documented.
    expect(resolveJsDocLinkHref("AdapterFactory", index, FABRIC_PAGE)).toBe(
      "/docs/data-sources/overview/api-reference/#adapter-factory"
    )
  })

  it("resolves a same-page {@link} to a bare #anchor fragment", () => {
    // {@link FabricConnectionConfig} rendered on the fabric page is same-page.
    expect(
      resolveJsDocLinkHref("FabricConnectionConfig", index, FABRIC_PAGE)
    ).toBe("#fabric-connection-config")
  })

  it("falls back to a same-page #createSlug anchor for unknown symbols", () => {
    expect(resolveJsDocLinkHref("NotIndexedType", index, FABRIC_PAGE)).toBe(
      "#not-indexed-type"
    )
  })

  it("returns null for a symbol excluded from the current page", () => {
    // An excluded symbol is not documented on the page, so a same-page
    // `{@link}` to it must not fall back to a dead `#overrides-for` anchor;
    // null signals the renderer to degrade the link to plain text.
    const excluded = new Set(["OverridesFor"])

    expect(
      resolveJsDocLinkHref("OverridesFor", index, FABRIC_PAGE, excluded)
    ).toBeNull()
  })

  it("resolves normally when the excluded set does not contain the symbol", () => {
    const excluded = new Set(["SomethingElse"])

    expect(
      resolveJsDocLinkHref(
        "FabricConnectionConfig",
        index,
        FABRIC_PAGE,
        excluded
      )
    ).toBe("#fabric-connection-config")
  })

  it("resolves a Class.method member reference to the method anchor", () => {
    expect(
      resolveJsDocLinkHref("FabricDataSource.schemas", index, FABRIC_PAGE)
    ).toBe("#fabric-data-source-schemas")
  })

  it("passes through real URLs unchanged", () => {
    expect(
      resolveJsDocLinkHref("https://example.com", index, FABRIC_PAGE)
    ).toBe("https://example.com")
  })

  it("passes through absolute paths unchanged", () => {
    expect(resolveJsDocLinkHref("/docs/guide", index, FABRIC_PAGE)).toBe(
      "/docs/guide"
    )
  })

  it("passes through existing fragments unchanged", () => {
    expect(resolveJsDocLinkHref("#already", index, FABRIC_PAGE)).toBe(
      "#already"
    )
  })
})
