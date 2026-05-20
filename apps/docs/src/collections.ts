import { Collection, Directory } from "renoun/file-system"

import { docSchema } from "./validations"

export const LakeQlDocs = new Directory({
  basePathname: "lakeql",
  filter: (entry) =>
    !entry.baseName.startsWith("_") && !entry.absolutePath.includes("_assets"),
  loader: {
    mdx: (contentPath) => import(`../content/lakeql/${contentPath}.mdx`),
  },
  path: `content/lakeql`,
  schema: {
    mdx: docSchema,
  },
})

export const CliDocs = new Directory({
  basePathname: "cli",
  filter: (entry) =>
    !entry.baseName.startsWith("_") && !entry.absolutePath.includes("_assets"),
  loader: {
    mdx: (contentPath) => import(`../content/cli/${contentPath}.mdx`),
  },
  path: `content/cli`,
  schema: {
    mdx: docSchema,
  },
})

export const AllDocumentation = new Collection({
  entries: [LakeQlDocs, CliDocs],
})
