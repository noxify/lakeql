import {
  Collection,
  Directory,
  Repository,
  NodeFileSystem,
} from "renoun/file-system"

import { docSchema } from "./validations"

export const availableCollections = [
  "lakeql",
  "cli",
  "api",
  "query-builder",
  "trino-client",
  "schema-generator",
  "column-parser",
  "response-transformer",
  "file-generator",
  "helpers",
  "logger",
] as const
export type AvailableCollection = (typeof availableCollections)[number]

const repository = Repository.remote({
  owner: "noxify",
  repository: "lakeql",
  host: "github",
  baseUrl: "https://github.com",
})

const fileSystem = new NodeFileSystem()

export function createDirectories() {
  return availableCollections.map(
    (collection) =>
      new Directory({
        fileSystem,
        repository,
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
