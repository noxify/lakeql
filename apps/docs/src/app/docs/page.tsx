import { DEFAULT_DOCS_SLUG } from "@/lib/docs-default"

import DocsSlugLayout from "./[...slug]/layout"
import DocsSlugPage from "./[...slug]/page"

export default async function DocsIndexPage() {
  const params = Promise.resolve({ slug: [...DEFAULT_DOCS_SLUG] })

  return (
    <DocsSlugLayout params={params}>
      {await DocsSlugPage({
        params,
        searchParams: Promise.resolve({}),
      })}
    </DocsSlugLayout>
  )
}
