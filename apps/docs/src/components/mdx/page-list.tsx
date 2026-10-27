import { resolvePageListItems } from "@/collection-helpers"
import SectionGrid from "@/components/section-grid"
import type { SectionGridVariant } from "@/components/section-grid"

/**
 * A single entry for {@link PageList}, given as a documentation page path
 * relative to `/docs` (e.g. `"lakeql/introduction/overview"`). A leading slash
 * or `docs/` prefix is tolerated.
 */
export type PageListItemInput = string

export interface PageListProps {
  /**
   * The pages to list, in display order. Each is a page path relative to
   * `/docs`. Title and description are read from the target page's frontmatter,
   * so they are never maintained twice.
   */
  items: PageListItemInput[]
  /**
   * How to render the list.
   *
   * - `"card"` (default) — a grid of cards, matching the automatic section grid.
   * - `"list"` — a compact vertical list, for "in this section" / "where to
   *   next" links inside a page.
   */
  variant?: SectionGridVariant
  /** Optional class name forwarded to the underlying grid. */
  className?: string
}

/**
 * Renders a curated grid of links to other documentation pages.
 *
 * Unlike the automatic section grid shown on directory and index pages,
 * `PageList` is explicit: you choose exactly which pages appear and in what
 * order. The title and description of each card are pulled from the target
 * page's frontmatter, so updating a page's frontmatter updates every
 * `PageList` that points at it.
 *
 * Pages that do not resolve are skipped silently, so a stale reference drops a
 * card rather than breaking the build.
 *
 * @example
 * ```mdx
 * <PageList
 *   variant="list"
 *   items={[
 *     "lakeql/introduction/key-concepts",
 *     "lakeql/getting-started",
 *   ]}
 * />
 * ```
 */
export async function PageList({ items, variant, className }: PageListProps) {
  const resolved = await resolvePageListItems(items)

  if (resolved.length === 0) {
    return null
  }

  return (
    <SectionGrid items={resolved} variant={variant} className={className} />
  )
}
