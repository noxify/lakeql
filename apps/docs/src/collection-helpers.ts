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

export interface ResolvedDocEntry {
  entry: EntryType
  frontmatter?: Frontmatter
  title: string
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
          const metadata = await getEntryFrontmatter(entry)

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

  const returnedPath =
    readmeFile?.getPathname({ includeBasePathname: true }) ??
    indexFile?.getPathname({ includeBasePathname: true }) ??
    segmentFile?.getPathname({ includeBasePathname: true })

  if (returnedPath !== `/${segmentsKey}`) {
    return null
  }

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

function isIndexOrReadmeEntry(entry: EntryType) {
  return (
    isFile(entry) && (entry.baseName === "index" || entry.baseName === "readme")
  )
}

export function getCanonicalEntry(entry: EntryType): EntryType {
  return isIndexOrReadmeEntry(entry) ? entry.getParent() : entry
}

type EntryWithStructure = EntryType & {
  getStructure?: () => unknown | Promise<unknown>
}

async function resolveEntryWithStructure(entry: EntryType) {
  const entryWithStructure = entry as EntryWithStructure

  if (typeof entryWithStructure.getStructure === "function") {
    return entry
  }

  const resolved = await AllDocumentation.getEntry(
    entry.getPathnameSegments({ includeBasePathname: true })
  )

  return resolved ?? entry
}

function readFrontmatterFromStructure(structure: unknown) {
  const nodes = Array.isArray(structure) ? structure : [structure]
  const orderedNodes = Array.isArray(structure)
    ? nodes.filter((node) => {
        if (typeof node !== "object" || node === null) {
          return false
        }

        const maybeBaseName = (node as { baseName?: unknown }).baseName
        return maybeBaseName === "index" || maybeBaseName === "readme"
      })
    : nodes

  for (const node of orderedNodes) {
    if (
      typeof node === "object" &&
      node !== null &&
      "frontmatter" in node &&
      (node as { frontmatter?: Frontmatter }).frontmatter
    ) {
      return (node as { frontmatter?: Frontmatter }).frontmatter
    }
  }
}

async function getFrontmatterFromStructure(entry: EntryType) {
  const resolvedEntry = await resolveEntryWithStructure(entry)
  const entryWithStructure = resolvedEntry as EntryWithStructure

  if (typeof entryWithStructure.getStructure !== "function") {
    return
  }

  const structure = await entryWithStructure.getStructure()
  return readFrontmatterFromStructure(structure)
}

export async function getEntryFrontmatter(entry: EntryType) {
  const directFrontmatter = await getFrontmatterFromStructure(entry)

  if (directFrontmatter) {
    return directFrontmatter
  }

  if (isDirectory(entry)) {
    const segments = entry.getPathnameSegments({ includeBasePathname: true })
    const [indexEntry, readmeEntry] = await Promise.all([
      AllDocumentation.getEntry([...segments, "index"]).catch(() => null),
      AllDocumentation.getEntry([...segments, "readme"]).catch(() => null),
    ])

    if (indexEntry) {
      const indexFrontmatter = await getFrontmatterFromStructure(indexEntry)
      if (indexFrontmatter) {
        return indexFrontmatter
      }
    }

    if (readmeEntry) {
      return getFrontmatterFromStructure(readmeEntry)
    }
  }
}

export async function resolveDocEntry(
  entry: EntryType
): Promise<ResolvedDocEntry> {
  const canonicalEntry = getCanonicalEntry(entry)
  const frontmatter = await getEntryFrontmatter(entry)

  return {
    entry: canonicalEntry,
    frontmatter,
    title: getTitle(canonicalEntry, frontmatter, false),
  }
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
 * Returns breadcrumb items for a slug, compatible with the POC API.
 *
 * @param slug page slug segments (e.g. ["lakeql", "components", "alerts"]).
 * @param allEntries optional pre-fetched breadcrumb entries to avoid repeated lookups.
 */
export async function getBreadcrumbItems(
  slug: string[] = []
): Promise<BreadcrumbItem[]> {
  // "index" should not appear as a visible breadcrumb element
  const cleanedSlug = slug.filter((segment) => segment !== "index")
  const combinations = cleanedSlug.map((_, idx) =>
    cleanedSlug.slice(0, idx + 1)
  )

  const entries = await Promise.all(
    combinations.map(async (segments) => {
      const entry = await AllDocumentation.getEntry(segments)
      if (!entry) {
        return null
      }

      const resolved = await resolveDocEntry(entry)
      return {
        title: resolved.title,
        path: resolved.entry.getPathnameSegments({ includeBasePathname: true }),
      }
    })
  )

  return entries.filter((e): e is BreadcrumbItem => !!e)
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
