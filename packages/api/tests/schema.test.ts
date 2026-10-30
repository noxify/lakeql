import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadSchema, SchemaFilesNotFoundError } from "../src/schema"

describe(loadSchema, () => {
  let emptyDir: string

  beforeEach(async () => {
    emptyDir = await mkdtemp(path.join(tmpdir(), "lakeql-schema-"))
  })

  afterEach(async () => {
    await rm(emptyDir, { recursive: true, force: true })
  })

  it("throws a typed SchemaFilesNotFoundError when no schema files exist", async () => {
    await expect(loadSchema({ schemaPath: emptyDir })).rejects.toBeInstanceOf(
      SchemaFilesNotFoundError
    )
  })

  it("points the user at the pull command and schemaPath option", async () => {
    // A fresh project has no generated schemas yet; the message must tell the
    // user how to produce them rather than only listing glob patterns.
    await expect(loadSchema({ schemaPath: emptyDir })).rejects.toThrow(/pull/u)
    await expect(loadSchema({ schemaPath: emptyDir })).rejects.toThrow(
      /schemaPath/u
    )
  })

  it("resolves the schema dir from baseDir when schemaPath is omitted", async () => {
    // With no schemaPath, the search must happen in the consumer's baseDir —
    // never inside the installed @lakeql/api package (which would always fail).
    await expect(loadSchema({ baseDir: emptyDir })).rejects.toMatchObject({
      name: "SchemaFilesNotFoundError",
      schemaDir: emptyDir,
    })
  })
})
