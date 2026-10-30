"use client"

import { FileIcon as SymbolFileIcon } from "@react-symbols/icons/utils"
import { useMemo } from "react"

import {
  FileTree as BaseFileTree,
  FileTreeFile,
  FileTreeFolder,
  FileTreeName,
  FileTreeIcon,
} from "@/components/ai/file-tree"

interface FileEntry {
  path: string
  description?: string
}

interface TreeNode {
  name: string
  path: string
  isFile: boolean
  children: TreeNode[]
  highlighted?: boolean
  description?: string
}

// Sort: folders first, then files, alphabetically within each group
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .toSorted((a, b) => {
      if (a.isFile !== b.isFile) {
        return a.isFile ? 1 : -1
      }
      return a.name.localeCompare(b.name)
    })
    .map((node) => ({
      ...node,
      children: sortNodes(node.children),
    }))
}

function buildTree(
  files: (string | FileEntry)[],
  highlight: Set<string>
): TreeNode[] {
  const root: TreeNode[] = []

  for (const file of files) {
    const filePath = typeof file === "string" ? file : file.path
    const description = typeof file === "string" ? undefined : file.description
    const segments = filePath.split("/")
    let currentLevel = root

    for (let i = 0; i < segments.length; i += 1) {
      // oxlint-disable-next-line typescript/no-non-null-assertion
      const segment = segments[i]!
      const currentPath = segments.slice(0, i + 1).join("/")
      const isFile = i === segments.length - 1

      let existing = currentLevel.find((node) => node.name === segment)

      if (!existing) {
        existing = {
          name: segment,
          path: currentPath,
          isFile,
          children: [],
          highlighted: isFile && highlight.has(filePath),
          description: isFile ? description : undefined,
        }
        currentLevel.push(existing)
      }

      if (!isFile) {
        currentLevel = existing.children
      }
    }
  }

  return sortNodes(root)
}

function renderNode(node: TreeNode): React.ReactNode {
  if (node.isFile) {
    return (
      <FileTreeFile
        key={node.path}
        path={node.path}
        name={node.name}
        className={
          node.highlighted
            ? "bg-green-500/10 text-green-600 dark:text-green-400"
            : undefined
        }
      >
        <span className="size-4" />
        <FileTreeIcon>
          <SymbolFileIcon fileName={node.name} autoAssign className="size-4" />
        </FileTreeIcon>
        <FileTreeName>{node.name}</FileTreeName>
        {node.description && (
          <span className="text-muted-foreground ml-2 truncate text-xs">
            {node.description}
          </span>
        )}
      </FileTreeFile>
    )
  }

  return (
    <FileTreeFolder key={node.path} path={node.path} name={node.name}>
      {node.children.map(renderNode)}
    </FileTreeFolder>
  )
}

interface MdxFileTreeProps {
  /** Array of file paths or objects with path + description */
  files: (string | { path: string; description?: string })[]
  /** Paths to highlight (e.g. newly created files) */
  highlight?: string[]
  /** Folder paths to expand by default */
  defaultExpanded?: string[]
}

/**
 * MDX wrapper for the FileTree component.
 * Automatically builds a tree structure from an array of file paths.
 *
 * @example
 * ```mdx
 * <FileTree
 *   files={[
 *     { path: "src/index.ts", description: "Entry point" },
 *     { path: "src/config.ts", description: "Server configuration" },
 *     "package.json",
 *   ]}
 *   defaultExpanded={["src"]}
 * />
 * ```
 */
export const MdxFileTree = ({
  files,
  // oxlint-disable-next-line react/no-object-type-as-default-prop
  highlight = [],
  // oxlint-disable-next-line react/no-object-type-as-default-prop
  defaultExpanded = [],
}: MdxFileTreeProps) => {
  const highlightSet = useMemo(() => new Set(highlight), [highlight])
  const tree = useMemo(
    () => buildTree(files, highlightSet),
    [files, highlightSet]
  )
  const expandedSet = useMemo(() => new Set(defaultExpanded), [defaultExpanded])

  return (
    <BaseFileTree defaultExpanded={expandedSet}>
      {tree.map(renderNode)}
    </BaseFileTree>
  )
}
