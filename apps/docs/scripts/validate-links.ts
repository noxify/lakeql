import {
  printErrors,
  readFiles,
  scanURLs,
  validateFiles,
} from "next-validate-link"
import { getMDXSections } from "renoun/mdx"

import {
  getApiReferenceExports,
  getDocumentationEntryBySlug,
  getEntryFrontmatter,
  getFileContent,
  staticRoutes,
} from "@/collection-helpers"

/**
 * Validates internal documentation links and anchor fragments in the docs
 * content against the routes and heading anchors the app actually renders.
 *
 * URL generation and anchor generation reuse the app's own renoun-based
 * helpers so the validator can never drift from the renderer:
 *
 * - Valid page URLs come from {@link staticRoutes} — the authoritative slug
 *   list that `generateStaticParams` in `docs/[...slug]/page.tsx` uses. Each
 *   slug maps to `/docs/<slug...>`, matching the pathnames authors link to.
 * - Heading anchors come from renoun's `getMDXSections` — the same section
 *   extractor `renoun`'s `File.getSections()` falls back to for MDX content,
 *   so the computed anchor ids are identical to the `id`s the rendered page
 *   and on-page TOC use. (`File.getSections()` itself cannot run under a plain
 *   `tsx` process because its primary path imports the compiled MDX module,
 *   which Node cannot load for a `.mdx` extension; calling `getMDXSections` on
 *   the raw text is the identical fallback renoun uses internally.)
 * - For api-reference pages, anchors also come from {@link getApiReferenceExports}
 *   — the identical `createSlug` anchors the reference sections render,
 *   including class-method anchors.
 *
 * Scope: this validates the `docs/[...slug]` URL space, which is where
 * author-written internal links and `#fragment` anchors point. The `llms/`,
 * `raw/`, `sitemap/` and `docs.snapshot/` routes serve machine-readable output
 * that content does not link to internally, so they are intentionally out of
 * scope and not populated here.
 */
async function checkLinks() {
  const routes = await staticRoutes()

  const pages = await Promise.all(
    routes.map(async (slug) => ({
      value: slug,
      hashes: await collectAllowedHashes(slug),
    }))
  )

  const scanned = await scanURLs({
    populate: {
      "docs/[...slug]": pages,
    },
  })

  const files = await readFiles("content/**/*.{md,mdx}")

  printErrors(
    await validateFiles(files, {
      scanned,
    }),
    // exit with code 1 when broken links/anchors are detected
    true
  )
}

/**
 * Removes a leading YAML frontmatter block from MDX source.
 *
 * renoun's MDX pipeline parses frontmatter separately from the document body.
 * When we feed raw file text to `getMDXSections` directly, the leading `---`
 * fenced block is still present. Removing it keeps the section extractor
 * aligned with what the renderer parses as body content. This only removes the
 * delimited block and never touches heading text or slugging.
 */
function stripFrontmatter(source: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/u.exec(source)
  return match ? source.slice(match[0].length) : source
}

/**
 * Collects every anchor id a rendered docs page exposes, so `#fragment` links
 * to that page can be validated.
 *
 * Reuses renoun's `getMDXSections` for heading anchors and, when the page
 * carries `apiReference` frontmatter, the reference symbol anchors produced by
 * {@link getApiReferenceExports}.
 */
async function collectAllowedHashes(slug: string[]): Promise<string[]> {
  const entry = await getDocumentationEntryBySlug(slug).catch(() => null)

  if (!entry) {
    return []
  }

  const hashes = new Set<string>()

  const file = await getFileContent(entry).catch(() => null)

  if (file) {
    const text = await file.getText().catch(() => null)

    if (text) {
      collectSectionIds(getMDXSections(stripFrontmatter(text)), hashes)
    }
  }

  const frontmatter = await getEntryFrontmatter(entry).catch(() => null)
  const references = frontmatter?.apiReference ?? []

  if (references.length > 0) {
    const apiExports = await getApiReferenceExports(references).catch(() => [])

    for (const reference of apiExports) {
      for (const exportInfo of reference.exports) {
        hashes.add(exportInfo.slug)

        for (const method of exportInfo.methods ?? []) {
          hashes.add(method.slug)
        }
      }
    }
  }

  return [...hashes]
}

type MdxSection = ReturnType<typeof getMDXSections>[number]

/**
 * Recursively collects every section `id` into {@link hashes}.
 *
 * `getMDXSections` nests deeper headings under a parent section's `children`,
 * so a flat pass would miss sub-heading anchors.
 */
function collectSectionIds(
  sections: readonly MdxSection[],
  hashes: Set<string>
): void {
  for (const section of sections) {
    if (typeof section.id === "string" && section.id.length > 0) {
      hashes.add(section.id)
    }

    if (section.children && section.children.length > 0) {
      collectSectionIds(section.children, hashes)
    }
  }
}

void checkLinks()
