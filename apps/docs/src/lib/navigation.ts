import { cache } from "react"

import { AllDocumentation } from "@/collections"

import { isExternal, isHidden, resolveDocEntry } from "../collection-helpers"

export type NavBadge =
  | "new"
  | "updated"
  | "beta"
  | "experimental"
  | "deprecated"
  | "pulse"

export interface TreeItem {
  navBadge?: NavBadge
  navIcon?: string
  title: string
  url: string
  external: boolean
  children: TreeItem[]
  favorite?: boolean
}

type TreeNode = Awaited<ReturnType<typeof AllDocumentation.getTree>>[number]

async function mapTreeNode(
  node: TreeNode,
  seenUrls: Set<string>
): Promise<TreeItem | null> {
  const { entry } = node

  if (isHidden(entry)) {
    return null
  }

  const resolved = await resolveDocEntry(entry)
  const { entry: targetEntry, frontmatter, title } = resolved

  const external = Boolean(frontmatter?.externalLink) || isExternal(entry)
  const internalUrl = `/${["docs", ...targetEntry.getPathnameSegments({ includeBasePathname: true })].join("/")}`
  const url = frontmatter?.externalLink ?? internalUrl

  if (seenUrls.has(url)) {
    return null
  }

  seenUrls.add(url)

  const children = node.children
    ? await toTreeItems(node.children, seenUrls)
    : []

  return {
    navBadge: frontmatter?.navBadge,
    navIcon: frontmatter?.navIcon,
    title,
    url,
    external,
    children,
    favorite: frontmatter?.favorite ?? false,
  }
}

async function toTreeItems(
  nodes: Awaited<ReturnType<typeof AllDocumentation.getTree>>,
  seenUrls = new Set<string>()
): Promise<TreeItem[]> {
  const result: TreeItem[] = []

  for (const node of nodes) {
    const item = await mapTreeNode(node, seenUrls)

    if (item) {
      result.push(item)
    }
  }

  return result
}

// Module-level singleton: computed once per build process (or dev-server lifecycle).
// With `output: "export"` and a single worker, all page renders share the same
// Node.js process, so this eliminates the most expensive repeated computation.
let _navigationTreePromise: Promise<TreeItem[]> | null = null

export const getNavigationTree = cache(async (): Promise<TreeItem[]> => {
  if (!_navigationTreePromise) {
    _navigationTreePromise = (async () => {
      const collections = await AllDocumentation.getTree({
        includeIndexAndReadmeFiles: true,
      })
      return toTreeItems(collections)
    })()
  }

  return _navigationTreePromise
})

export interface NavigationGroup {
  label: string
  items: TreeItem[]
}

export function flattenNavigationItems(items: TreeItem[]): TreeItem[] {
  const result: TreeItem[] = []

  for (const item of items) {
    result.push(item)

    if (item.children.length > 0) {
      result.push(...flattenNavigationItems(item.children))
    }
  }

  return result
}

export function getFavoriteNavigationItems(
  groups: NavigationGroup[]
): TreeItem[] {
  return groups
    .flatMap((group) => flattenNavigationItems(group.items))
    .filter((item) => item.favorite)
}

const _collectionNavigationCache = new Map<string, NavigationGroup[]>()

export const getCollectionNavigation = cache(
  async (collection: string): Promise<NavigationGroup[]> => {
    const cached = _collectionNavigationCache.get(collection)
    if (cached) {
      return cached
    }

    const tree = await getNavigationTree()
    const collectionRootPath = `/docs/${collection}`
    const rootNode = tree.find(
      (item) => !item.external && item.url === collectionRootPath
    )

    if (!rootNode) {
      return []
    }

    // Trenne Blätter (ohne Children) und Gruppen (mit Children)
    const leaves: TreeItem[] = []
    const groups: NavigationGroup[] = []

    for (const child of rootNode.children) {
      if (child.children.length === 0) {
        leaves.push(child)
      } else {
        groups.push({ label: child.title, items: child.children })
      }
    }

    const result: NavigationGroup[] = []
    if (leaves.length > 0) {
      result.push({ label: "", items: leaves })
    }
    result.push(...groups)
    _collectionNavigationCache.set(collection, result)
    return result
  }
)

function flattenItems(items: TreeItem[]): TreeItem[] {
  const result: TreeItem[] = []

  for (const item of items) {
    result.push(item)

    if (item.children.length > 0) {
      result.push(...flattenItems(item.children))
    }
  }

  return result
}

const _linearNavigationCache = new Map<string, TreeItem[]>()

export const getCollectionLinearNavigation = cache(
  async (collection: string): Promise<TreeItem[]> => {
    const cached = _linearNavigationCache.get(collection)
    if (cached) {
      return cached
    }

    const tree = await getNavigationTree()
    const collectionRootPath = `/docs/${collection}`
    const rootNode = tree.find(
      (item) => !item.external && item.url === collectionRootPath
    )

    if (!rootNode) {
      return []
    }

    const leaves: TreeItem[] = []
    const groupedParents: TreeItem[] = []

    for (const child of rootNode.children) {
      if (child.children.length === 0) {
        leaves.push(child)
      } else {
        groupedParents.push(child)
      }
    }

    const ordered: TreeItem[] = [...leaves]

    for (const parent of groupedParents) {
      // Include parent landing pages in sibling navigation before nested pages.
      ordered.push(parent)
      ordered.push(...flattenItems(parent.children))
    }

    // Previous/next navigation should stay within internal docs pages.
    const result = ordered.filter((item) => !item.external)
    _linearNavigationCache.set(collection, result)
    return result
  }
)
