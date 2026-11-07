import type { Root } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMdx from "remark-mdx"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import { unified } from "unified"

import { expandCodeAwareComponents } from "./expand-plugin"

const stringifyOptions = {
  bullet: "-",
  fences: true,
  rule: "-",
} as const

/**
 * Parses MDX source and serializes it back to plain Markdown with every
 * code-aware component expanded and every presentational wrapper degraded.
 *
 * Parsing uses `remark-mdx` (so JSX becomes `mdxJsx*` nodes) and
 * `remark-frontmatter` (so the leading `--- yaml ---` block stays a top-level
 * YAML node). After {@link expandCodeAwareComponents} runs, no `mdxJsx*` node
 * remains, so serialization is done with a separate processor that omits
 * `remark-mdx`: this avoids the MDX stringify extension escaping plain-text
 * tokens such as `{`/`}`/`<` (e.g. `import.config.{mjs,ts,js,json}`), which
 * would otherwise gain stray backslashes. Processing is async because the
 * expand plugin awaits source-driven renderers.
 *
 * @param source - The raw MDX document text.
 * @returns The serialized Markdown.
 */
export async function runPipeline(source: string): Promise<string> {
  const parser = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkMdx)
    .use(remarkGfm)
    .use(expandCodeAwareComponents)

  const tree = parser.parse(source)
  const expandedTree = (await parser.run(tree)) as Root

  // Serialize without remark-mdx. Valid because the expand plugin leaves no
  // mdxJsx* nodes behind, so there is nothing for the MDX stringify extension
  // to handle — and its unsafe-character escaping no longer applies.
  const stringifier = unified()
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkStringify, stringifyOptions)

  return stringifier.stringify(expandedTree)
}
