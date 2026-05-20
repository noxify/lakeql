import path from "node:path"

import { cache } from "react"
import { isDirectory, isFile } from "renoun/file-system"
import type { z } from "zod"

import { AllDocumentation } from "./collections"
import type { frontmatterSchema } from "./validations"

export type Frontmatter = z.infer<typeof frontmatterSchema>
export interface TransformedEntry {
  group: string
  fullPathname: string
  relativePathname: string
  segments: string[]
  title: string
  description?: string
  path: string
  isDirectory: boolean
  sortOrder: number
  depth: number
  baseName: string
  hasFile: boolean
}

export interface BreadcrumbItem {
  title: string
  path: string[]
}

export interface BreadcrumbEntry {
  pathname: string
  segments: string[]
  breadcrumbTitle: string
  pageTitle: string
}

/**
 * Normalizes route-like paths so matching works independent of slash style.
 *
 * Examples:
 * - "lakeql/introduction/" -> "/lakeql/introduction"
 * - "//lakeql//introduction" -> "/lakeql/introduction"
 */
function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim()
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  const collapsed = withLeadingSlash.replaceAll(/\/{2,}/gu, "/")

  if (collapsed === "/") {
    return collapsed
  }

  return collapsed.replace(/\/+$/u, "")
}

export type EntryType = Awaited<ReturnType<typeof AllDocumentation.getEntry>>

const getDocumentationEntryBySlugCached = cache(async (slugKey: string) => {
  const segments = slugKey ? slugKey.split("/") : []
  return AllDocumentation.getEntry(segments)
})

export async function getDocumentationEntryBySlug(slug: string[]) {
  return getDocumentationEntryBySlugCached(slug.join("/"))
}

let _rootCollectionsPromise: Promise<
  {
    description: string | undefined
    entrypoint: string
    group: string
    title: string
  }[]
> | null = null

export const rootCollections = cache(async () => {
  if (!_rootCollectionsPromise) {
    _rootCollectionsPromise = (async () => {
      const collections = AllDocumentation.getRootEntries()

      return await Promise.all(
        collections.map(async (entry) => {
          const collectionFile = await getFileContent(entry)
          const metadata = await getMetadata(collectionFile)

          return {
            description: metadata?.description,
            entrypoint:
              metadata?.entrypoint ??
              `/${path.join("docs", ...entry.getPathnameSegments({ includeBasePathname: true }))}`,
            group: entry.name,
            title: metadata ? getTitle(entry, metadata, true) : entry.title,
          }
        })
      )
    })()
  }

  return _rootCollectionsPromise
})

const getFileContentByPathCached = cache(async (segmentsKey: string) => {
  const segments = segmentsKey.split("/")

  const [segmentFile, indexFile, readmeFile] = await Promise.all([
    AllDocumentation.getFile(segments, "mdx").catch(() => null),
    AllDocumentation.getFile([...segments, "index"], "mdx").catch(() => null),
    AllDocumentation.getFile([...segments, "readme"], "mdx").catch(() => null),
  ])

  return segmentFile ?? indexFile ?? readmeFile ?? null
})

export async function getFileContent(source: EntryType) {
  const segments = source.getPathnameSegments({
    includeBasePathname: true,
    includeDirectoryNamedSegment: true,
  })

  return getFileContentByPathCached(segments.join("/"))
}

export async function getMetadata(
  file: Awaited<ReturnType<typeof getFileContent>>
) {
  return (await file?.getExportValue("frontmatter")) ?? undefined
}

export function getTitle(
  entry: EntryType,
  frontmatter?: Frontmatter,
  includeTitle = false
): string {
  return includeTitle
    ? (frontmatter?.navTitle ?? frontmatter?.title ?? entry.title)
    : (frontmatter?.navTitle ?? entry.title)
}

/**
 * Returns sibling entries for rendering local section grids.
 *
 * For index files we resolve siblings from the parent directory so the index
 * route behaves like the directory route.
 */
export async function getSections(
  source: Awaited<ReturnType<typeof AllDocumentation.getEntry>>
) {
  if (source.depth > -1) {
    if (isDirectory(source)) {
      const directory = await AllDocumentation.getDirectory(
        source.getPathnameSegments({ includeBasePathname: true })
      )
      const parent = await directory.getEntries()
      return parent
    }

    if (isFile(source) && source.baseName === "index") {
      const directory = await AllDocumentation.getDirectory(
        source.getParent().getPathnameSegments({ includeBasePathname: true })
      )
      const parent = await directory.getEntries()
      return parent
    }
    return []
  }
  const directory = await AllDocumentation.getDirectory(
    source.getPathnameSegments({ includeBasePathname: true })
  )
  const parent = await directory.getEntries()
  return parent
}

export function getRootSections() {
  return AllDocumentation.getRootEntries() as EntryType[]
}

export const staticRoutes = cache(async () => {
  const rootEntries = await AllDocumentation.getTree({
    includeIndexAndReadmeFiles: true,
  })
  return await parseTree(rootEntries)
})

async function parseTree(
  input: Awaited<ReturnType<typeof AllDocumentation.getTree>>,
  seen = new Set<string>()
) {
  const result: string[][] = []

  for (const node of input) {
    const segments = node.entry.getPathnameSegments({
      includeBasePathname: true,
    })
    const key = segments.join("/")

    if (!seen.has(key)) {
      seen.add(key)
      result.push(segments)
    }

    if (node.children) {
      const childResults = await parseTree(node.children, seen)
      result.push(...childResults)
    }
  }
  return result
}

/**
 * For breadcrumb labels we only want metadata that belongs to the current route.
 *
 * For directories this intentionally resolves only index/readme files, avoiding
 * accidental label leakage from an arbitrary child file.
 */
async function getBreadcrumbFileContent(source: EntryType) {
  if (isDirectory(source)) {
    const segments = source.getPathnameSegments({ includeBasePathname: true })
    const [indexFile, readmeFile] = await Promise.all([
      AllDocumentation.getFile([...segments, "index"], "mdx").catch(() => null),
      AllDocumentation.getFile([...segments, "readme"], "mdx").catch(
        () => null
      ),
    ])

    return indexFile ?? readmeFile ?? null
  }

  return getFileContent(source)
}

/**
 * Builds a per-collection breadcrumb lookup table.
 *
 * The table is keyed by normalized pathname and stores two labels:
 * - breadcrumbTitle: used for intermediate breadcrumb items
 * - pageTitle: used for the last breadcrumb item
 */
const getBreadcrumbEntriesCached = cache(
  async (group?: string): Promise<BreadcrumbEntry[]> => {
    const tree = await AllDocumentation.getTree({
      includeIndexAndReadmeFiles: true,
    })
    const allEntries = flattenTree(tree)

    const relevantEntries = allEntries.filter((entry) => {
      if (isHidden(entry) || isExternal(entry)) {
        return false
      }

      const segments = entry.getPathnameSegments({ includeBasePathname: true })
      if (!segments[0]) {
        return false
      }

      if (group && segments[0] !== group) {
        return false
      }

      return true
    })

    const resolvedEntries = await Promise.all(
      relevantEntries.map(async (entry) => {
        const pathname = normalizePathname(
          `/${entry.getPathname({ includeBasePathname: true })}`
        )
        const segments = pathname
          .split("/")
          .filter((segment) => segment.length > 0)
        const file = await getBreadcrumbFileContent(entry)
        const metadata = await getMetadata(file)

        return {
          item: {
            pathname,
            segments,
            // Intermediate breadcrumb labels should prefer navTitle, then entry title.
            breadcrumbTitle: getTitle(entry, metadata, false),
            // Final page label can use full title fallback chain.
            pageTitle: getTitle(entry, metadata, true),
          },
          // Prefer directory label for shared paths (e.g. /lakeql/introduction).
          rank: isDirectory(entry) ? 0 : 1,
        }
      })
    )

    const entryMap = new Map<string, { rank: number; item: BreadcrumbEntry }>()

    for (const resolved of resolvedEntries) {
      const existing = entryMap.get(resolved.item.pathname)

      if (!existing || resolved.rank < existing.rank) {
        entryMap.set(resolved.item.pathname, resolved)
      }
    }

    return [...entryMap.values()].map((value) => value.item)
  }
)

/**
 * Returns breadcrumb items for a slug, compatible with the POC API.
 *
 * @param slug page slug segments (e.g. ["lakeql", "components", "alerts"]).
 * @param allEntries optional pre-fetched breadcrumb entries to avoid repeated lookups.
 */
export async function getBreadcrumbItems(
  slug: string[] = [],
  allEntries?: BreadcrumbEntry[]
): Promise<BreadcrumbItem[]> {
  // "index" should not appear as a visible breadcrumb segment.
  const cleanedSlug = slug.filter((segment) => segment !== "index")

  const combinations = cleanedSlug.map((_, index) =>
    cleanedSlug.slice(0, index + 1)
  )

  const entries =
    allEntries ?? (await getBreadcrumbEntriesCached(cleanedSlug[0]))

  // Convert list lookup to O(1) by normalized pathname.
  const entryByPath = new Map<string, BreadcrumbEntry>()
  for (const entry of entries) {
    entryByPath.set(normalizePathname(entry.pathname), entry)
  }

  const items: BreadcrumbItem[] = []
  for (const [index, currentPageSegment] of combinations.entries()) {
    const currentPath = normalizePathname(`/${currentPageSegment.join("/")}`)
    const entry = entryByPath.get(currentPath)

    if (!entry) {
      continue
    }

    // Use pageTitle only for the last node to avoid duplicate-looking crumbs.
    const isLastSegment = index === combinations.length - 1
    items.push({
      path: entry.segments,
      title: isLastSegment ? entry.pageTitle : entry.breadcrumbTitle,
    })
  }

  return items
}

/**
 * Flattens the docs tree into a de-duplicated navigation sequence.
 *
 * Index/readme nodes are skipped because they are represented by their parent
 * directory route in navigation and sibling resolution.
 */
function flattenTree(
  tree: Awaited<ReturnType<typeof AllDocumentation.getTree>>,
  seen = new Set<string>()
): EntryType[] {
  const result: EntryType[] = []
  for (const node of tree) {
    // Skip index/readme files – they are represented by their parent directory entry
    if (node.entry.baseName === "index" || node.entry.baseName === "readme") {
      if (node.children) {
        result.push(...flattenTree(node.children, seen))
      }
      continue
    }
    const pathname = node.entry.getPathname({ includeBasePathname: true })
    if (!seen.has(pathname)) {
      seen.add(pathname)
      result.push(node.entry)
    }
    if (node.children) {
      result.push(...flattenTree(node.children, seen))
    }
  }
  return result
}

/**
 * Resolves previous/next navigation entries based on the flattened visible tree.
 *
 * Index routes are compared against their parent directory pathname so docs
 * pages and directory routes share consistent sibling behavior.
 */
export async function getSiblings(
  source: EntryType
): Promise<[EntryType | undefined, EntryType | undefined]> {
  const tree = await AllDocumentation.getTree({
    includeIndexAndReadmeFiles: true,
  })
  const allEntries = flattenTree(tree)

  const visibleEntries = allEntries.filter(
    (entry) => !isHidden(entry) && !isExternal(entry)
  )

  // For index files, compare against the parent directory pathname
  const sourcePathname =
    isFile(source) && source.baseName === "index"
      ? source.getParent().getPathname({ includeBasePathname: true })
      : source.getPathname({ includeBasePathname: true })

  const currentIndex = visibleEntries.findIndex(
    (e) => e.getPathname({ includeBasePathname: true }) === sourcePathname
  )

  if (currentIndex === -1) {
    return [undefined, undefined]
  }

  return [
    currentIndex > 0 ? visibleEntries[currentIndex - 1] : undefined,
    currentIndex < visibleEntries.length - 1
      ? visibleEntries[currentIndex + 1]
      : undefined,
  ]
}

export function isHidden(
  entry: Awaited<ReturnType<typeof AllDocumentation.getEntry>>
) {
  return entry.baseName.startsWith("_")
}

export function isExternal(
  entry: Awaited<ReturnType<typeof AllDocumentation.getEntry>>
) {
  return entry.baseName.includes(".external")
}
