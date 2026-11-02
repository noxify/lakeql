import { cache } from "react"
import { createSlug } from "renoun"

import {
  getDocumentationEntryBySlug,
  getEntryFrontmatter,
} from "@/collection-helpers"
import { resolvePackagePath } from "@/components/mdx/api-reference/utils"
import { cachePromise } from "@/lib/cache-promise"
import { analyzeSyntacticExports } from "@/lib/ts-morph-analysis"
import { getNormalizedDocPaths } from "@/shared/doc-paths"

/**
 * Where a documented symbol lives: the absolute route of the api-reference page
 * that renders it and the kebab-case anchor of its section on that page.
 */
export interface SymbolLocation {
  /**
   * Absolute docs route of the page that documents the symbol, e.g.
   * `/docs/data-sources/overview/api-reference`.
   */
  pageHref: string
  /**
   * Section anchor for the symbol on {@link pageHref}, produced by renoun's
   * `createSlug` so it always matches the `id` the section elements render.
   */
  anchor: string
}

/**
 * Process-scoped map from exported symbol name to the page + anchor that
 * documents it. Member references (`Class.method`) are resolved against the
 * base symbol, so only top-level export names are keys.
 */
export type SymbolIndex = ReadonlyMap<string, SymbolLocation>

const _symbolIndexCache = new Map<string, Promise<SymbolIndex>>()

/**
 * Builds a process-scoped index mapping every exported symbol rendered on an
 * api-reference page to its page route and section anchor.
 *
 * The index powers resolution of inline JSDoc `{@link SymbolName}` references,
 * which renoun emits as the bare symbol name with no page and no anchor. Each
 * api-reference page is discovered from the docs routing (`getNormalizedDocPaths`,
 * the same source `generateStaticParams` uses), its `apiReference` frontmatter
 * entries are read, and every exported symbol in the referenced source file is
 * resolved to `{ pageHref, anchor: createSlug(name) }` — the identical
 * `createSlug` the section elements use for their `id`, so anchors always match.
 *
 * Page iteration order follows `getNormalizedDocPaths`, which is the
 * deterministic docs-tree traversal order. When the same symbol is documented
 * on more than one page, the first page in that order wins and later duplicates
 * are ignored, so resolution is stable across builds.
 *
 * Resolution failures for a single page or file are swallowed so one broken
 * reference file cannot fail the whole index (and thus the build); that page's
 * symbols are simply absent and fall back to a same-page anchor at link time.
 *
 * @returns A read-only map keyed by export name.
 */
export const buildSymbolIndex = cache(async (): Promise<SymbolIndex> =>
  cachePromise(_symbolIndexCache, "default", async () => {
    const index = new Map<string, SymbolLocation>()
    const docPaths = await getNormalizedDocPaths()

    for (const slug of docPaths) {
      // oxlint-disable-next-line no-await-in-loop -- sequential keeps first-match order deterministic
      const entry = await getDocumentationEntryBySlug(slug).catch(() => null)

      if (!entry) {
        continue
      }

      // oxlint-disable-next-line no-await-in-loop
      const frontmatter = await getEntryFrontmatter(entry).catch(() => null)
      const references = frontmatter?.apiReference ?? []

      if (references.length === 0) {
        continue
      }

      const pageHref = `/docs/${slug.join("/")}`

      for (const reference of references) {
        // oxlint-disable-next-line no-await-in-loop
        const exportInfos = await analyzeSyntacticExports(
          resolvePackagePath(reference.file)
        ).catch(() => [])

        for (const info of exportInfos) {
          // First page in iteration order wins for duplicate symbol names.
          if (index.has(info.name)) {
            continue
          }

          index.set(info.name, {
            pageHref,
            anchor: createSlug(info.name),
          })
        }
      }
    }

    return index
  })
)
