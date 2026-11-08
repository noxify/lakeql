import { z } from "zod"

export const frontmatterSchema = z.object({
  alias: z.string().optional(),
  description: z.string().optional(),
  entrypoint: z.string().optional(),
  externalLink: z.url().optional(),
  ignoreSearch: z.boolean().optional().default(false),
  navBadge: z
    .enum(["new", "updated", "beta", "experimental", "deprecated", "pulse"])
    .optional(),
  navIcon: z.string().optional(),
  navTitle: z.string().optional(),
  apiReference: z
    .array(
      z.object({
        name: z.string(),
        file: z.string(),
        // Export names to omit from this page's generated API reference.
        // Absent or empty excludes nothing, so entries without it are
        // unchanged. The listed names are dropped everywhere the exports are
        // materialized (page, TOC, link-validator anchors, {@link} index, raw
        // markdown, and search index) so an excluded symbol never leaks.
        exclude: z.array(z.string()).optional(),
      })
    )
    .default([]),
  cliCommand: z.string().optional(),
  separator: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional(),
  title: z.string().optional(),
  toc: z.boolean().optional().default(true),
  favorite: z.boolean().optional().default(false),
})

export const headingSchema = z.array(
  z.object({
    id: z.string(),
    level: z.number(),
    text: z.string(),
  })
)

export const docSchema = {
  frontmatter: frontmatterSchema,
  headings: headingSchema,
}
