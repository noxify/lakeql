import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const { dirname } = import.meta

/**
 * Doc 07 requires the INSERT write strategy to have no object-storage
 * dependency in its package graph. The module must not import
 * `@lakeql/storage` or `files-sdk` (directly or transitively via the
 * adapter's own storage-backed modules).
 */
describe("insert-write-strategy import graph", () => {
  it("does not import @lakeql/storage or files-sdk", () => {
    const source = readFileSync(
      path.join(dirname, "..", "src", "insert-write-strategy.ts"),
      "utf-8"
    )

    // Consider only import/export statements, not prose in comments.
    const importSpecifiers = [
      ...source.matchAll(/from\s+"(?<specifier>[^"]+)"/gu),
    ].map((m) => m.groups?.specifier)

    expect(importSpecifiers).not.toContain("@lakeql/storage")
    expect(importSpecifiers).not.toContain("files-sdk")
    // Must not pull in the storage-backed write strategy or hive table manager.
    expect(importSpecifiers).not.toContain("./write-strategy")
    expect(importSpecifiers).not.toContain("./hive-table-manager")
  })
})
