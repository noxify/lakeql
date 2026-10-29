import path from "node:path"

import { parseMarkdown } from "@zbsearch/docs-index/node"
import type { MarkdownSection, ParsedMarkdown } from "@zbsearch/docs-index/node"
import type { Ora } from "ora"
import pMap from "p-map"
import { isDirectory, isFile } from "renoun/file-system"
import { create } from "zbsearch"

import {
  getFileContent,
  getBreadcrumbItems,
  getMetadata,
  getTitle,
  isExternal,
  isHidden,
} from "@/collection-helpers"
import type { EntryType } from "@/collection-helpers"
import { AllDocumentation } from "@/collections"
import { mdxToMarkdown } from "@/lib/raw-markdown"
import type { ApiReferenceFrontmatterEntry } from "@/lib/raw-markdown"
/**
 * Gets all entries in the documentation that can be indexed for search.
 */
export async function getAllSearchableEntries() {
  const tree = await AllDocumentation.getTree({
    includeIndexAndReadmeFiles: true,
  })
  const rootEntries = tree.flatMap((node) => {
    const all = [node.entry]
    if (!node.children) {
      return all
    }
    const walk = (children: typeof node.children) => {
      for (const child of children) {
        all.push(child.entry)
        if (child.children) {
          walk(child.children)
        }
      }
    }
    walk(node.children)
    return all
  })
  return flattenEntries(rootEntries).filter(
    (entry) => !isDirectory(entry) || (isDirectory(entry) && isFile(entry))
  )
}

export type DocumentType = "page" | "heading" | "text"

export interface ZBDocument {
  id: string
  page_id: string
  type: DocumentType
  title: string
  section: string
  heading: string
  content: string
  url: string
  breadcrumb: string
}

export interface HeadingSection {
  id: string
  title: string
  depth: number
}

export function flattenEntries(entries: EntryType[]): EntryType[] {
  const seen = new Set<string>()
  const result: EntryType[] = []

  for (const entry of entries) {
    if (isHidden(entry) || isExternal(entry)) {
      continue
    }

    if (
      isFile(entry) &&
      (entry.baseName === "index" || entry.baseName === "readme")
    ) {
      continue
    }

    const pathname = entry.getPathname({ includeBasePathname: true })
    if (seen.has(pathname)) {
      continue
    }

    seen.add(pathname)
    result.push(entry)
  }

  return result
}

export function normalizeHeadingTitle(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, " ")
}

export function toPathname(entry: EntryType): string {
  const segments = entry.getPathnameSegments({ includeBasePathname: true })
  return `/${path.join("docs", ...segments)}/`
}

/**
 * Creates the zbsearch index with the shared schema used by both build paths
 * (the force-static route and the standalone generate script).
 *
 * Sorting is disabled: the client UI orders hits by score on the client and
 * uses `distinctOn: "url"`, which reads the document store rather than the
 * sorter, so no query depends on zbsearch's sort index. Dropping it shrinks the
 * persisted index by the whole sorting block (~0.6 MB) with no behavior change.
 *
 * @returns A fresh, empty zbsearch index ready for `insertMultiple`.
 */
export function createSearchIndex() {
  return create({
    schema: {
      breadcrumb: "string",
      content: "string",
      heading: "string",
      page_id: "string",
      section: "string",
      title: "string",
      type: "enum" as const,
      url: "string",
    },
    sort: { enabled: false },
  })
}

/**
 * The per-page context the section→schema mapping needs. Everything here is
 * computed from renoun (title, breadcrumb, pathname) or the entry's slug, so
 * the mapping stays pure: it depends only on its inputs and never touches the
 * filesystem or renoun directly.
 */
export interface SectionMappingContext {
  /** The page pathname, e.g. `/docs/data-sources/trino/write-config/`. */
  pathname: string
  /** The resolved page title. */
  pageTitle: string
  /** The page description (frontmatter), used as the `page` doc content. */
  pageDescription?: string
  /** The collection/section name derived from the first slug segment. */
  sectionName: string
  /** The `" > "`-joined breadcrumb string. */
  breadcrumbStr: string
  /**
   * Renoun's heading sections for the page (the TOC source of truth). Used to
   * resolve in-page anchors so links match the rendered page exactly. Empty
   * on the standalone script path, where parsed anchors are used instead.
   */
  renounSections: HeadingSection[]
}

/**
 * Resolves an in-page anchor for a parsed section.
 *
 * Author-written headings have a matching renoun section whose `id` is the
 * anchor the rendered page and TOC use, so we prefer that for exact link
 * parity. Synthetic sub-headings emitted by `<ApiReference>` /
 * `<CliCommandDetails>` (e.g. "Properties", "Parameters") have no renoun
 * section, so we fall back to the parser's github-slugger slug. The fallback
 * always targets a valid page; at worst it lands near the right section.
 *
 * Matching consumes renoun sections in order via `remaining`, so repeated
 * heading titles on one page map to distinct anchors.
 *
 * @param section - The parsed markdown section.
 * @param remaining - Renoun sections grouped by normalized title, mutated as
 *   matches are consumed.
 * @returns The resolved anchor fragment (without `#`).
 */
function resolveAnchor(
  section: MarkdownSection,
  remaining: Map<string, HeadingSection[]>
): string {
  const key = normalizeHeadingTitle(section.heading)
  const matches = remaining.get(key)
  const renounMatch = matches?.shift()
  if (renounMatch) {
    return renounMatch.id
  }

  return section.anchor
}

/**
 * Maps a parsed Markdown document onto the three-type search index schema
 * (`page` / `heading` / `text`) the client UI queries.
 *
 * Emits exactly one `page` doc, one `heading` doc per section with a non-empty
 * heading, and one `text` doc per section with non-empty content. The intro
 * section (`heading === ""`) produces only a headless `text` doc linked to the
 * page itself. This is pure and deterministic, which is what the unit tests
 * exercise (fixed Markdown → `parseMarkdown` → this function).
 *
 * @param parsed - The result of `parseMarkdown(markdown, { dialect: "mdx" })`.
 * @param ctx - Per-page context (pathname, title, breadcrumb, renoun sections).
 * @returns The search documents for the page.
 */
export function mapSectionsToDocuments(
  parsed: ParsedMarkdown,
  ctx: SectionMappingContext
): ZBDocument[] {
  const {
    pathname,
    pageTitle,
    pageDescription,
    sectionName,
    breadcrumbStr,
    renounSections,
  } = ctx

  const docs: ZBDocument[] = []

  let chunkId = 0
  const nextId = () => {
    const id = `${pathname}-${chunkId}`
    chunkId += 1
    return id
  }

  // Page document (title + description).
  docs.push({
    breadcrumb: breadcrumbStr,
    content: pageDescription ?? pageTitle,
    heading: "",
    id: pathname,
    page_id: pathname,
    section: sectionName,
    title: pageTitle,
    type: "page",
    url: pathname,
  })

  // Renoun anchors grouped by normalized heading title, consumed in order.
  const remaining = new Map<string, HeadingSection[]>()
  for (const renounSection of renounSections) {
    const key = normalizeHeadingTitle(renounSection.title)
    const existing = remaining.get(key) ?? []
    existing.push(renounSection)
    remaining.set(key, existing)
  }

  for (const section of parsed.sections) {
    const hasHeading = section.heading.length > 0
    const anchor = hasHeading ? resolveAnchor(section, remaining) : ""
    const url = hasHeading ? `${pathname}#${anchor}` : pathname

    // Heading document (one per non-empty heading).
    if (hasHeading) {
      docs.push({
        breadcrumb: breadcrumbStr,
        content: section.heading,
        heading: section.heading,
        id: nextId(),
        page_id: pathname,
        section: sectionName,
        title: pageTitle,
        type: "heading",
        url,
      })
    }

    // Text document (one per section with non-empty content). This is where
    // code/config terms such as `basePath` and `Record<string, string>` now
    // live, verbatim, because `parseMarkdown` keeps inline-code values opaque.
    if (section.content.length > 0) {
      docs.push({
        breadcrumb: breadcrumbStr,
        content: section.content,
        heading: section.heading,
        id: nextId(),
        page_id: pathname,
        section: sectionName,
        title: pageTitle,
        type: "text",
        url,
      })
    }
  }

  return docs
}

export async function buildSearchDocuments(
  entries: EntryType[],
  spinner?: Ora
) {
  let processed = 0
  const allDocs: ZBDocument[] = []

  await pMap(
    entries,
    async (entry) => {
      const file = await getFileContent(entry)
      if (!file) {
        return
      }

      const [metadata, rawContent, rawSections] = await Promise.all([
        getMetadata(file).catch(() => null),
        file.getText().catch(() => null),
        file.getSections().catch(() => null),
      ])
      const renounSections = (rawSections ?? []).filter(
        (section): section is HeadingSection =>
          typeof section.id === "string" &&
          typeof section.title === "string" &&
          typeof section.depth === "number"
      )

      processed += 1
      if (spinner && (processed % 25 === 0 || processed === entries.length)) {
        spinner.text = `Preparing docs ${processed}/${entries.length}...`
      }

      const pathname = toPathname(entry)
      const slugSegments = entry.getPathnameSegments({
        includeBasePathname: true,
      })
      const breadcrumbItems = await getBreadcrumbItems(slugSegments)
      const title = getTitle(entry, metadata ?? undefined, true)
      const sectionName = slugSegments[0] ?? "docs"
      const breadcrumbStr =
        breadcrumbItems.map((item) => item.title).join(" > ") ||
        slugSegments.join(" > ")

      const ctx: SectionMappingContext = {
        breadcrumbStr,
        pageDescription: metadata?.description,
        pageTitle: title,
        pathname,
        renounSections,
        sectionName,
      }

      // If the body is unreadable, keep the page discoverable by title only.
      if (rawContent === null) {
        // oxlint-disable-next-line no-console
        console.warn(`[search-index] unreadable body, title-only: ${pathname}`)
        allDocs.push(...mapSectionsToDocuments({ sections: [] }, ctx))
        return
      }

      const apiReferenceEntries: ApiReferenceFrontmatterEntry[] = Array.isArray(
        metadata?.apiReference
      )
        ? (metadata.apiReference as ApiReferenceFrontmatterEntry[])
        : []

      let parsed: ParsedMarkdown
      try {
        const markdown = await mdxToMarkdown(rawContent, {
          appendApiReferences: apiReferenceEntries,
        })
        parsed = parseMarkdown(markdown, { dialect: "mdx" })
      } catch (error) {
        // The raw-markdown pipeline degrades internally, so an outer throw
        // means remark could not parse the MDX. Fall back to parsing the raw
        // source directly (still generic-safe), and finally to title-only.
        // oxlint-disable-next-line no-console
        console.warn(`[search-index] mdxToMarkdown failed: ${pathname}`, error)
        try {
          parsed = parseMarkdown(rawContent, { dialect: "mdx" })
        } catch (fallbackError) {
          // oxlint-disable-next-line no-console
          console.warn(
            `[search-index] parseMarkdown failed, title-only: ${pathname}`,
            fallbackError
          )
          parsed = { sections: [] }
        }
      }

      allDocs.push(...mapSectionsToDocuments(parsed, ctx))
    },
    { concurrency: 8 }
  )

  return allDocs
}
