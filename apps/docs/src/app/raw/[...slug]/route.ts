import { notFound } from "next/navigation"
import type { NextRequest } from "next/server"

import { getMetadata } from "@/collection-helpers"
import { AllDocumentation } from "@/collections"
import { mdxToMarkdown } from "@/lib/raw-markdown"
import type { ApiReferenceFrontmatterEntry } from "@/lib/raw-markdown"
import {
  getRawRouteParams,
  normalizeRawSlugParts,
  textResponse,
} from "@/shared/doc-paths"

export const dynamic = "force-static"

export async function generateStaticParams() {
  return getRawRouteParams()
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/raw/[...slug]">
) {
  const { slug } = await ctx.params
  const normalizedSlug = [...normalizeRawSlugParts(slug)]

  let file = await AllDocumentation.getFile(normalizedSlug, "mdx").catch(
    () => null
  )

  if (!file) {
    file = await AllDocumentation.getFile(
      [...normalizedSlug, "index"],
      "mdx"
    ).catch(() => null)
  }

  if (!file) {
    file = await AllDocumentation.getFile(
      [...normalizedSlug, "readme"],
      "mdx"
    ).catch(() => null)
  }

  if (!file) {
    notFound()
  }

  const source = await file.getText()

  // Unlike page.tsx (which reads frontmatter unguarded in a Promise.all), the
  // raw route degrades to "no append" if the frontmatter read throws rather
  // than failing the whole route.
  const frontmatter = await getMetadata(file).catch(() => null)

  const apiReferenceEntries: ApiReferenceFrontmatterEntry[] =
    frontmatter?.apiReference && Array.isArray(frontmatter.apiReference)
      ? (frontmatter.apiReference as ApiReferenceFrontmatterEntry[])
      : []

  const markdown = await mdxToMarkdown(source, {
    appendApiReferences: apiReferenceEntries,
  })

  return textResponse(markdown)
}
