import { parseMarkdown } from "@zbsearch/docs-index/node"
import { describe, expect, it } from "vitest"

import { mapSectionsToDocuments, normalizeHeadingTitle } from "./builder"
import type { HeadingSection, SectionMappingContext } from "./builder"

// A fixed Markdown string shaped like the raw-markdown pipeline output: an
// intro paragraph mentioning a config key, an author heading with prose, and a
// synthetic ApiReference-style `####` sub-heading with a GFM table carrying an
// inline-code generic type. This needs no ts-morph/@lakeql build, so it runs
// under the CI job that only builds `./packages/*`.
const MARKDOWN = `Configure the writer with \`basePath\` before anything else.

## Write Config

The \`writeConfig\` controls output. \`batchSize\` tunes throughput and
\`loadStrategy\` selects append vs full load.

#### Properties

| Property | Type |
| --- | --- |
| \`tableProperties?\` | \`Record<string, string>\` |
`

function makeContext(
  overrides: Partial<SectionMappingContext> = {}
): SectionMappingContext {
  return {
    breadcrumbStr: "Data Sources > Write Config",
    pageDescription: "How to configure the Trino writer.",
    pageTitle: "Write Config",
    pathname: "/docs/data-sources/trino/write-config/",
    renounSections: [],
    sectionName: "data-sources",
    ...overrides,
  }
}

describe("section → schema mapping", () => {
  it("emits one page doc, a heading doc per non-empty heading, and a text doc per non-empty section", () => {
    const parsed = parseMarkdown(MARKDOWN, { dialect: "mdx" })
    const docs = mapSectionsToDocuments(parsed, makeContext())

    const pageDocs = docs.filter((doc) => doc.type === "page")
    const headingDocs = docs.filter((doc) => doc.type === "heading")
    const textDocs = docs.filter((doc) => doc.type === "text")

    expect(pageDocs).toHaveLength(1)
    // "Write Config" and "Properties" are the two non-empty headings.
    expect(headingDocs).toHaveLength(2)
    expect(headingDocs.map((doc) => doc.heading)).toStrictEqual([
      "Write Config",
      "Properties",
    ])
    // Intro + the two heading sections each carry content.
    expect(textDocs).toHaveLength(3)
  })

  it("keeps the page doc content as the description and links to the page root", () => {
    const parsed = parseMarkdown(MARKDOWN, { dialect: "mdx" })
    const [pageDoc] = mapSectionsToDocuments(parsed, makeContext())

    expect(pageDoc?.type).toBe("page")
    expect(pageDoc?.content).toBe("How to configure the Trino writer.")
    expect(pageDoc?.url).toBe("/docs/data-sources/trino/write-config/")
    expect(pageDoc?.id).toBe("/docs/data-sources/trino/write-config/")
    expect(pageDoc?.page_id).toBe("/docs/data-sources/trino/write-config/")
  })

  it("preserves generic types and config keys verbatim in text content", () => {
    const parsed = parseMarkdown(MARKDOWN, { dialect: "mdx" })
    const docs = mapSectionsToDocuments(parsed, makeContext())
    const allText = docs
      .filter((doc) => doc.type === "text")
      .map((doc) => doc.content)
      .join("\n")

    // The exact failure of the old regex approach: this must be intact, not
    // truncated to "Record".
    expect(allText).toContain("Record<string, string>")
    expect(allText).toContain("basePath")
    expect(allText).toContain("writeConfig")
    expect(allText).toContain("batchSize")
    expect(allText).toContain("loadStrategy")
  })

  it("emits a headless text doc for the intro section linked to the page root", () => {
    const parsed = parseMarkdown(MARKDOWN, { dialect: "mdx" })
    const docs = mapSectionsToDocuments(parsed, makeContext())
    const introDoc = docs.find(
      (doc) => doc.type === "text" && doc.heading === ""
    )

    expect(introDoc).toBeDefined()
    expect(introDoc?.content).toContain("basePath")
    expect(introDoc?.url).toBe("/docs/data-sources/trino/write-config/")
  })

  it("resolves anchors from renoun ids when a heading matches, else the parsed slug", () => {
    const parsed = parseMarkdown(MARKDOWN, { dialect: "mdx" })
    const renounSections: HeadingSection[] = [
      { depth: 2, id: "write-config-custom", title: "Write Config" },
    ]
    const docs = mapSectionsToDocuments(parsed, makeContext({ renounSections }))

    const writeConfigHeading = docs.find(
      (doc) => doc.type === "heading" && doc.heading === "Write Config"
    )
    const propertiesHeading = docs.find(
      (doc) => doc.type === "heading" && doc.heading === "Properties"
    )

    // Renoun id wins for the author heading (exact link parity with the page).
    expect(writeConfigHeading?.url).toBe(
      "/docs/data-sources/trino/write-config/#write-config-custom"
    )
    // The synthetic `#### Properties` has no renoun section → parser slug.
    expect(propertiesHeading?.url).toBe(
      "/docs/data-sources/trino/write-config/#properties"
    )
  })

  it("populates page_id, breadcrumb, and section on every doc", () => {
    const parsed = parseMarkdown(MARKDOWN, { dialect: "mdx" })
    const docs = mapSectionsToDocuments(parsed, makeContext())

    for (const doc of docs) {
      expect(doc.page_id).toBe("/docs/data-sources/trino/write-config/")
      expect(doc.breadcrumb).toBe("Data Sources > Write Config")
      expect(doc.section).toBe("data-sources")
      expect(doc.title).toBe("Write Config")
    }
  })

  it("emits only the page doc when there are no parsed sections", () => {
    const docs = mapSectionsToDocuments({ sections: [] }, makeContext())

    expect(docs).toHaveLength(1)
    expect(docs[0]?.type).toBe("page")
  })
})

describe("heading title normalization", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeHeadingTitle("  Write   Config  ")).toBe("write config")
  })
})
