// oxlint-disable vitest/max-expects

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadConfig } from "../src/load-config"

/**
 * Creates a temporary directory for a real config file.
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lakeql-runtime-obj-test-"))
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

/**
 * A config module that constructs Files-like and Serializer-like runtime
 * objects (class instances with prototype methods) and places them on a
 * data source's `connection` and `writeConfig`. This exercises the real
 * loadConfig pipeline the same way an application config would.
 */
const CONFIG_MODULE = `
class FakeFiles {
  constructor(bucket) {
    this.bucket = bucket
  }
  upload(key) {
    return "uploaded:" + key
  }
}

class FakeSerializer {
  constructor(extension) {
    this.extension = extension
  }
  serialize() {
    return { extension: this.extension }
  }
}

export const files = new FakeFiles("my-bucket")
export const serializer = new FakeSerializer("parquet")

export default {
  dataSources: {
    warehouse: {
      adapter: "trino",
      connection: files,
      writeConfig: { serializer },
    },
  },
  adapters: [],
}
`

describe("Runtime-object preservation through loadConfig", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    removeTempDir(tempDir)
  })

  it("preserves the connection instance's prototype and methods", async () => {
    fs.writeFileSync(path.join(tempDir, "lakeql.config.mjs"), CONFIG_MODULE)

    const result = await loadConfig({ cwd: tempDir })

    const connection = result.config.dataSources["warehouse"]?.connection as {
      bucket: string
      upload: (key: string) => string
    }

    // instanceof is preserved (constructor name survives; not a plain object)
    expect(connection.constructor.name).toBe("FakeFiles")
    // Own data survives
    expect(connection.bucket).toBe("my-bucket")
    // Prototype method remains callable and produces the expected result
    expect(connection.upload).toBeTypeOf("function")
    expect(connection.upload("data.parquet")).toBe("uploaded:data.parquet")
    // The method lives on the prototype, not copied onto the instance —
    // a JSON round-trip or deep clone would have dropped/relocated it.
    expect(Object.hasOwn(connection, "upload")).toBeFalsy()
  })

  it("preserves a serializer instance nested in writeConfig", async () => {
    fs.writeFileSync(path.join(tempDir, "lakeql.config.mjs"), CONFIG_MODULE)

    const result = await loadConfig({ cwd: tempDir })

    const writeConfig = result.config.dataSources["warehouse"]?.writeConfig as {
      serializer: {
        extension: string
        serialize: () => { extension: string }
      }
    }

    const { serializer } = writeConfig
    expect(serializer.constructor.name).toBe("FakeSerializer")
    expect(serializer.extension).toBe("parquet")
    expect(serializer.serialize).toBeTypeOf("function")
    expect(serializer.serialize()).toStrictEqual({ extension: "parquet" })
    expect(Object.hasOwn(serializer, "serialize")).toBeFalsy()
  })

  it("keeps the same instance across repeated property access (no cloning)", async () => {
    fs.writeFileSync(path.join(tempDir, "lakeql.config.mjs"), CONFIG_MODULE)

    const result = await loadConfig({ cwd: tempDir })

    const a = result.config.dataSources["warehouse"]?.connection
    const b = result.config.dataSources["warehouse"]?.connection
    expect(a).toBe(b)
  })
})
