import { apiReferenceToMarkdown } from "./api-reference-markdown"
import { runPipeline } from "./pipeline"

/** A frontmatter `apiReference` entry; `name` is not forwarded to the renderer. */
export interface ApiReferenceFrontmatterEntry {
  name: string
  file: string
}

/** Options for {@link mdxToMarkdown}. */
export interface MdxToMarkdownOptions {
  /**
   * Frontmatter-driven API references to render and append after the body,
   * mirroring how the docs page renders `<ApiReference>` after its content.
   */
  appendApiReferences?: ApiReferenceFrontmatterEntry[]
}

/**
 * Transforms MDX documentation source into agent-friendly Markdown.
 *
 * The body is run through the unified pipeline (inline code-aware components
 * expanded, presentational wrappers degraded), then each frontmatter
 * `apiReference` entry is rendered and appended after the body. The append is a
 * string concatenation on the already-serialized body, so generated sections
 * land after the source content while the frontmatter block stays on top.
 * `entry.name` is intentionally not forwarded, matching the docs page which
 * renders the whole file's exports.
 *
 * @param source - The raw MDX document text.
 * @param options - Optional frontmatter API references to append.
 * @returns The combined Markdown.
 */
export async function mdxToMarkdown(
  source: string,
  options: MdxToMarkdownOptions = {}
): Promise<string> {
  const body = await runPipeline(source)

  const appendApiReferences = options.appendApiReferences ?? []

  if (appendApiReferences.length === 0) {
    return body
  }

  const appended = await Promise.all(
    appendApiReferences.map((entry) =>
      apiReferenceToMarkdown({ file: entry.file })
    )
  )

  const sections = appended.filter((section) => section.trim().length > 0)

  if (sections.length === 0) {
    return body
  }

  return `${[body.trimEnd(), ...sections].join("\n\n")}\n`
}
