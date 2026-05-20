import { Collection, Directory } from "renoun/file-system"

import { docSchema } from "./validations"

export const availableCollections = ["lakeql", "cli"] as const
export type AvailableCollection = (typeof availableCollections)[number]

export function createDirectories() {
  return availableCollections.map(
    (collection) =>
      new Directory({
        basePathname: collection,
        filter: (entry) =>
          !entry.baseName.startsWith("_") &&
          !entry.absolutePath.includes("_assets"),
        loader: {
          mdx: (contentPath) =>
            import(`../content/${collection}/${contentPath}.mdx`),
        },
        path: `content/${collection}`,
        schema: {
          mdx: docSchema,
        },
      })
  )
}

export const AllDocumentation = new Collection({
  entries: createDirectories(),
})
