import type { Paragraph, Parent, Root, RootContent } from "mdast"
import { visitParents } from "unist-util-visit-parents"

import type { MdxJsxElement } from "./mdast-helpers"
import {
  fallbackNode,
  parseMarkdownFragment,
  readStringAttr,
  readStringAttrs,
} from "./mdast-helpers"
import { markdownComponentRegistry } from "./registry"

interface Target {
  node: MdxJsxElement
  parent: Parent
  index: number
  /** Tree depth (`ancestors.length`); deeper nodes have a larger value. */
  depth: number
}

/**
 * Degrades a non-registered JSX wrapper to its own children.
 *
 * A reader-visible `title` (else `label`) string attribute is promoted so it is
 * not lost — as a bold paragraph for block elements, or inline `strong` for
 * text elements. MDX ESM/expression nodes are not visited by the plugin;
 * current content has none, so they pass through untouched.
 */
function degradeToChildren(node: MdxJsxElement): RootContent[] {
  const children = (node.children ?? []) as RootContent[]
  const promoted =
    readStringAttr(node, "title") ?? readStringAttr(node, "label")

  if (!promoted) {
    return children
  }

  if (node.type === "mdxJsxTextElement") {
    // Inline context: promote as an inline strong node ahead of the children.
    return [
      { type: "strong", children: [{ type: "text", value: promoted }] },
      ...children,
    ]
  }

  const titleNode: Paragraph = {
    type: "paragraph",
    children: [
      { type: "strong", children: [{ type: "text", value: promoted }] },
    ],
  }

  return [titleNode, ...children]
}

async function resolveReplacement(node: MdxJsxElement): Promise<RootContent[]> {
  const name = node.name ?? null
  const renderer = name ? markdownComponentRegistry[name] : undefined

  if (renderer && name) {
    try {
      const md = await renderer(readStringAttrs(node))
      return parseMarkdownFragment(md).children
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.warn(`[raw-markdown] ${name} expansion failed:`, error)
      return [fallbackNode(name)]
    }
  }

  return degradeToChildren(node)
}

/**
 * Remark transformer that expands code-aware JSX components into real Markdown
 * and degrades all other JSX wrappers to their children.
 *
 * `unist-util-visit-parents` visits synchronously, so targets are collected
 * first (with their parent, index, and depth), all renderers are awaited, and
 * replacements are spliced deepest-first — within equal depth, highest index
 * first — so nested wrappers (e.g. `<Step>` inside `<Steps>`) are resolved
 * inside their parent before the parent itself is replaced.
 */
export function expandCodeAwareComponents() {
  return async (tree: Root): Promise<void> => {
    const targets: Target[] = []

    visitParents(tree, (node, ancestors) => {
      if (
        node.type !== "mdxJsxFlowElement" &&
        node.type !== "mdxJsxTextElement"
      ) {
        return
      }

      const parent = ancestors.at(-1) as Parent | undefined

      if (!parent) {
        return
      }

      const index = parent.children.indexOf(node as RootContent)

      if (index === -1) {
        return
      }

      targets.push({
        node: node as MdxJsxElement,
        parent,
        index,
        depth: ancestors.length,
      })
    })

    const replacements = await Promise.all(
      targets.map((t) => resolveReplacement(t.node))
    )

    const ordered = targets
      .map((t, i) => ({ ...t, replacement: replacements[i] ?? [] }))
      // Deepest first; within equal depth, highest index first so sibling
      // indices stay valid as each parent is spliced from the end.
      .toSorted((a, b) => b.depth - a.depth || b.index - a.index)

    for (const { parent, index, replacement } of ordered) {
      parent.children.splice(index, 1, ...replacement)
    }
  }
}
