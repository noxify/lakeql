import { createSlug } from "renoun"

import type { SymbolIndex } from "./api-reference-symbol-index"

/**
 * True when `href` is a bare JSDoc `{@link}` target — a symbol name renoun
 * emitted verbatim as the url — rather than a real URL, absolute path, or
 * same-page fragment.
 *
 * renoun's `transformJSDocInlineTags` copies the link target into the url with
 * no slugify and no page, so `{@link AdapterFactory}` arrives as
 * `href="AdapterFactory"`. Anything with a scheme, a `/`, or a leading `#` is
 * already a resolvable href and is left untouched.
 */
function isBareSymbolHref(href: string): boolean {
  return (
    href.length > 0 &&
    !href.includes("://") &&
    !href.includes("/") &&
    !href.startsWith("#") &&
    !href.startsWith("mailto:")
  )
}

/**
 * Resolves an inline JSDoc `{@link}` href to the correct api-reference target.
 *
 * Only bare symbol hrefs are rewritten; real URLs, absolute paths, and
 * same-page fragments pass through unchanged. For a bare symbol:
 *
 * - If the base symbol is in `excluded`, `null` is returned to signal that the
 *   target is not documented on this page, so the renderer degrades the link to
 *   plain text instead of emitting a dead same-page anchor. This keeps the
 *   rendered page in parity with every other consumer that drops excluded
 *   symbols.
 * - If the symbol is in `symbolIndex` and lives on a different page, an
 *   absolute `${pageHref}/#${anchor}` href is returned (fixes the cross-package
 *   wrong-page case).
 * - If the symbol is in the index on the current page, a same-page `#${anchor}`
 *   fragment is returned.
 * - If the symbol is not indexed, a same-page `#${createSlug(name)}` fragment is
 *   returned as a best-effort fallback, so the link is never dropped or left as
 *   a broken relative path.
 *
 * Member references like `{@link FabricDataSource.schemas}` resolve against the
 * base symbol (`FabricDataSource`): if the base is a class whose method matches,
 * the class method anchor `#${classAnchor}-${createSlug(member)}` is used,
 * mirroring how `reference-section.tsx` ids class methods; otherwise the base
 * symbol's section anchor is used.
 *
 * @param href - The raw href renoun produced for the `{@link}` tag.
 * @param symbolIndex - Process-scoped export-name → page/anchor index.
 * @param currentPageHref - Absolute route of the page currently rendering, used
 *   to decide between an absolute cross-page href and a same-page fragment.
 * @param excluded - Base symbol names excluded from the current page's
 *   reference. A `{@link}` to one of these resolves to `null` so the renderer
 *   drops the link rather than pointing at a section the page no longer renders.
 * @returns The resolved href, or `null` when the target is excluded from the
 *   current page and should render as plain text.
 */
export function resolveJsDocLinkHref(
  href: string,
  symbolIndex: SymbolIndex,
  currentPageHref: string,
  excluded?: ReadonlySet<string>
): string | null {
  if (!isBareSymbolHref(href)) {
    return href
  }

  // Split a possible member reference: `Class.method` → ["Class", "method"].
  const [base = href, member] = href.split(".")

  // A symbol excluded from this page is not documented here; drop the link so
  // it never resolves to a removed section's anchor.
  if (excluded?.has(base)) {
    return null
  }

  const location = symbolIndex.get(base)

  if (!location) {
    // Unknown symbol: best-effort same-page anchor on the base name.
    return `#${createSlug(base)}`
  }

  const anchor = member
    ? `${location.anchor}-${createSlug(member)}`
    : location.anchor

  if (location.pageHref === currentPageHref) {
    return `#${anchor}`
  }

  return `${location.pageHref}/#${anchor}`
}
