import type { Blockquote, Root } from "mdast"
import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import type {
  MdxJsxAttribute,
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from "mdast-util-mdx-jsx"
import { gfm } from "micromark-extension-gfm"

/** A JSX element node produced by `remark-mdx` (block or inline). */
export type MdxJsxElement = MdxJsxFlowElement | MdxJsxTextElement

/**
 * Reads all string-literal JSX attributes of a node into a plain record.
 *
 * Only `mdxJsxAttribute` entries whose `value` is a string literal are kept;
 * expression-valued attributes (`mdxJsxAttributeValueExpression`) and boolean
 * shorthand attributes (`value === null`) are ignored, so callers never act on
 * values the renderers cannot interpret.
 */
export function readStringAttrs(node: MdxJsxElement): Record<string, string> {
  const result: Record<string, string> = {}

  for (const attr of node.attributes) {
    if (attr.type !== "mdxJsxAttribute") {
      continue
    }

    if (typeof (attr as MdxJsxAttribute).value === "string") {
      result[attr.name] = attr.value as string
    }
  }

  return result
}

/**
 * Reads a single string-literal JSX attribute by name.
 *
 * @returns The attribute's string value, or `undefined` when it is absent,
 *   expression-valued, or a boolean shorthand.
 */
export function readStringAttr(
  node: MdxJsxElement,
  name: string
): string | undefined {
  for (const attr of node.attributes) {
    if (attr.type !== "mdxJsxAttribute" || attr.name !== name) {
      continue
    }

    if (typeof attr.value === "string") {
      return attr.value
    }
  }

  return undefined
}

/**
 * Parses a Markdown fragment emitted by a renderer into an mdast tree.
 *
 * GFM extensions are passed explicitly because the low-level `fromMarkdown`
 * call does not inherit the outer processor's `remark-gfm` plugin; without
 * them, table rows would parse as paragraphs instead of `table` nodes.
 */
export function parseMarkdownFragment(md: string): Root {
  return fromMarkdown(md, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
}

/**
 * Escapes a string for safe use inside a single GFM table cell.
 *
 * Pipes are escaped so they do not terminate the cell, and newlines are
 * collapsed to spaces so the row stays on one line.
 */
export function tableCell(text: string): string {
  return text
    .replaceAll("|", "\\|")
    .replaceAll(/\s*\n\s*/gu, " ")
    .trim()
}

/**
 * Builds a one-line blockquote fallback used when a registered renderer throws.
 *
 * Mirrors the React components' `try/catch → null` resilience: a broken
 * reference degrades to a visible note rather than failing the static build.
 */
export function fallbackNode(componentName: string): Blockquote {
  return {
    type: "blockquote",
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "text",
            value: `Documentation for `,
          },
          {
            type: "inlineCode",
            value: componentName,
          },
          {
            type: "text",
            value: ` could not be generated.`,
          },
        ],
      },
    ],
  }
}
