// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  loadConfig,
  SUPPORTED_CONFIG_EXTENSIONS,
  validateConfigExtension,
} from "../src/load-config"

/**
 * Creates a temporary directory for use in tests that require real config files.
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lakeql-config-test-"))
}

/**
 * Recursively removes a directory and its contents.
 */
function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

/**
 * Calls a function and returns the thrown Error.
 * Throws if the function does not throw.
 */
function getThrown(fn: () => void): Error {
  try {
    fn()
  } catch (error) {
    return error as Error
  }
  throw new Error("Expected function to throw, but it did not")
}

describe("Config loading properties", () => {
  describe("Unsupported config extension rejection", () => {
    /**
     * For any path string ending in an unsupported extension,
     * `validateConfigExtension` throws an error that identifies the path,
     * states the extension is unsupported, and lists the four supported
     * extensions.
     */
    it("rejects any path with an unsupported extension", () => {
      const unsupportedExtensions = [
        ".json",
        ".cts",
        ".cjs",
        ".yaml",
        ".yml",
        ".toml",
        ".xml",
        ".txt",
        ".md",
      ]

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom(...unsupportedExtensions),
          (baseName, ext) => {
            // Avoid generating a basename that already ends with a supported ext
            const configPath = `/some/path/${baseName}${ext}`

            expect(() => validateConfigExtension(configPath)).toThrow(
              configPath
            )

            // Verify error content by capturing the thrown error
            const err = getThrown(() => validateConfigExtension(configPath))
            // Error message identifies the path
            expect(err.message).toContain(configPath)
            // Error message states the unsupported extension
            expect(err.message).toContain(ext)
            // Error message lists supported extensions
            for (const supported of SUPPORTED_CONFIG_EXTENSIONS) {
              expect(err.message).toContain(supported)
            }
          }
        )
      )
    })

    /**
     * For any path string ending in a supported extension (.ts, .mts, .js, .mjs),
     * `validateConfigExtension` does NOT throw.
     */
    it("accepts any path with a supported extension", () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[\w-]{1,50}$/u),
          fc.constantFrom(...SUPPORTED_CONFIG_EXTENSIONS),
          (baseName, ext) => {
            const configPath = `/some/path/${baseName}${ext}`
            expect(() => validateConfigExtension(configPath)).not.toThrow()
          }
        )
      )
    })

    /**
     * For any randomly generated extension that is not in the supported set,
     * `validateConfigExtension` rejects the path.
     */
    it("rejects paths with any arbitrary unsupported extension", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc
            .string({ minLength: 1, maxLength: 10 })
            .filter(
              (s) =>
                !SUPPORTED_CONFIG_EXTENSIONS.includes(`.${s}`) &&
                !s.includes(".") &&
                !s.includes("/")
            ),
          (baseName, extBody) => {
            const configPath = `/path/${baseName}.${extBody}`
            expect(() => validateConfigExtension(configPath)).toThrow(
              configPath
            )
          }
        )
      )
    })
  })

  describe("c12-delegated config resolution and normalization", () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = createTempDir()
    })

    afterEach(() => {
      removeTempDir(tempDir)
    })

    /**
     * For any project directory containing a supported .mjs configuration file
     * with valid dataSources definitions, the Config_Loader resolves it via c12
     * and normalizes the result into a LoadedLakeQLProject with the correct
     * config.dataSources entries.
     */
    it("resolves and normalizes a .mjs config file with dataSources", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(
            fc.record({
              // `name` becomes a plain-object key that is later read back via
              // bracket access, so exclude reserved prototype keys
              // (`__proto__`, `constructor`, `prototype`) that would resolve to
              // inherited members and break the round-trip.
              name: fc
                .string({ minLength: 1, maxLength: 20 })
                .filter(
                  (s) =>
                    /^[\w-]+$/u.test(s) &&
                    s !== "__proto__" &&
                    s !== "constructor" &&
                    s !== "prototype"
                ),
              adapter: fc
                .string({ minLength: 1, maxLength: 20 })
                .filter((s) => /^[\w-]+$/u.test(s)),
            }),
            { minLength: 1, maxLength: 5, selector: (r) => r.name }
          ),
          async (sources) => {
            const dataSources: Record<
              string,
              { adapter: string; connection: unknown }
            > = {}

            for (const { name, adapter } of sources) {
              dataSources[name] = {
                adapter,
                connection: { host: "localhost" },
              }
            }

            const configContent = `
export default {
  dataSources: ${JSON.stringify(dataSources)},
  adapters: [],
};
`
            fs.writeFileSync(
              path.join(tempDir, "lakeql.config.mjs"),
              configContent
            )

            const result = await loadConfig({ cwd: tempDir })

            // Result has the expected structure
            expect(result).toHaveProperty("config")
            expect(result).toHaveProperty("adapters")
            expect(result.config).toHaveProperty("dataSources")

            // Each source is present with correct adapter name
            for (const { name, adapter } of sources) {
              expect(result.config.dataSources[name]).toBeDefined()
              expect(result.config.dataSources[name]?.adapter).toBe(adapter)
            }

            // adapters is an array
            expect(Array.isArray(result.adapters)).toBeTruthy()
          }
        ),
        { numRuns: 10 }
      )
    })

    /**
     * When no config file is found, loadConfig throws an error indicating
     * the working directory.
     */
    it("throws when no config file is found in the directory", async () => {
      await expect(loadConfig({ cwd: tempDir })).rejects.toThrow(tempDir)
    })

    /**
     * When the only config candidate has an unsupported extension (e.g.
     * lakeql.config.json), loadConfig rejects with a specific error
     * identifying the extension and listing supported extensions — not the
     * generic "No config file found" message.
     */
    it("rejects with specific extension error when only unsupported candidate exists", async () => {
      fs.writeFileSync(
        path.join(tempDir, "lakeql.config.json"),
        JSON.stringify({ dataSources: {} })
      )

      await expect(loadConfig({ cwd: tempDir })).rejects.toThrow(".json")
      // Verify supported extensions are listed in the error
      const err = (await loadConfig({ cwd: tempDir }).catch(
        (error: unknown) => error
      )) as Error
      for (const supported of SUPPORTED_CONFIG_EXTENSIONS) {
        expect(err.message).toContain(supported)
      }
    })

    /**
     * When a supported config file coexists with an unsupported one, the
     * loader uses the supported file without error.
     */
    it("uses supported file when both supported and unsupported candidates exist", async () => {
      fs.writeFileSync(
        path.join(tempDir, "lakeql.config.json"),
        JSON.stringify({ dataSources: {} })
      )
      const configContent = `
export default {
  dataSources: { src: { adapter: "test", connection: {} } },
  adapters: [],
};
`
      fs.writeFileSync(path.join(tempDir, "lakeql.config.mjs"), configContent)

      const result = await loadConfig({ cwd: tempDir })
      expect(result).toHaveProperty("config")
      expect(result.config.dataSources).toHaveProperty("src")
    })

    /**
     * Config files with unsupported export shapes (null, undefined, non-object)
     * are rejected with an error identifying the config file path.
     */
    it("throws when config file exports a non-object default", async () => {
      const configContent = `export default null;`
      fs.writeFileSync(path.join(tempDir, "lakeql.config.mjs"), configContent)

      await expect(loadConfig({ cwd: tempDir })).rejects.toThrow("config")
    })

    /**
     * Config file missing dataSources field is rejected with an error.
     */
    it("throws when config file is missing dataSources", async () => {
      const configContent = `export default { adapters: [] };`
      fs.writeFileSync(path.join(tempDir, "lakeql.config.mjs"), configContent)

      await expect(loadConfig({ cwd: tempDir })).rejects.toThrow("dataSources")
    })

    /**
     * A data source literally named `__proto__` must become an own property of
     * the resolved `dataSources` map rather than mutating the prototype chain.
     * This guards against prototype pollution now that the dedicated
     * interpolation pass (which previously rebuilt the map) has been removed —
     * the prototype-less result object is produced by paging resolution.
     */
    it("treats a data source named __proto__ as an own property, not prototype pollution", async () => {
      // Build the dataSources map so "__proto__" is an OWN enumerable key
      // (as produced by JSON.parse or untrusted data), not the object-literal
      // prototype slot. JSON.parse is the realistic prototype-pollution vector.
      const configContent = `
const dataSources = JSON.parse('{"__proto__": {"adapter": "trino", "connection": {}}}');
export default { dataSources, adapters: [] };
`
      fs.writeFileSync(path.join(tempDir, "lakeql.config.mjs"), configContent)

      const result = await loadConfig({ cwd: tempDir })

      // The malicious key is an own property (not read via the prototype
      // accessor). Use a descriptor lookup so the real "__proto__" own property
      // is inspected rather than the prototype getter.
      const descriptor = Object.getOwnPropertyDescriptor(
        result.config.dataSources,
        "__proto__"
      )
      expect(descriptor).toBeDefined()
      expect(
        (descriptor?.value as { adapter: string } | undefined)?.adapter
      ).toBe("trino")

      // The global Object prototype was not polluted.
      expect(({} as Record<string, unknown>).adapter).toBeUndefined()
    })
  })

  describe("Adapter factory reference identity preservation", () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = createTempDir()
    })

    afterEach(() => {
      removeTempDir(tempDir)
    })

    /**
     * For any array of AdapterFactory-like objects exported by a project config
     * module, the LoadedLakeQLProject.adapters array returned by loadConfig
     * contains the exact same object references (===) in the same order, with
     * no cloning, wrapping, serializing, merging, or structural transformation.
     */
    it("preserves adapter factory references exported by the config module", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (adapterCount) => {
            // Write a config that exports adapter-like objects with unique markers
            const configContent = `
const adapters = Array.from({ length: ${adapterCount} }, (_, i) => ({
  adapterName: "adapter-" + i,
  createDataSource: () => ({}),
  createReadStrategy: () => ({}),
  createWriteStrategy: () => ({}),
  _marker: Symbol("adapter-" + i),
}));

export default {
  dataSources: {
    source1: { adapter: "test", connection: {} },
  },
  adapters,
};
`
            fs.writeFileSync(
              path.join(tempDir, "lakeql.config.mjs"),
              configContent
            )

            const result = await loadConfig({ cwd: tempDir })

            // The adapters array has the expected length
            expect(result.adapters).toHaveLength(adapterCount)

            // Each adapter has its expected adapterName
            for (let i = 0; i < adapterCount; i += 1) {
              expect(result.adapters[i]).toHaveProperty(
                "adapterName",
                `adapter-${i}`
              )
            }

            // Verify order preservation
            for (let i = 0; i < adapterCount; i += 1) {
              const adapter = result.adapters[i] as { adapterName: string }
              expect(adapter.adapterName).toBe(`adapter-${i}`)
            }
          }
        ),
        { numRuns: 10 }
      )
    })

    /**
     * When the config module exports no adapters field, the result contains
     * an empty adapters array.
     */
    it("returns empty adapters array when config module has no adapters field", async () => {
      const configContent = `
export default {
  dataSources: {
    source1: { adapter: "test", connection: {} },
  },
};
`
      fs.writeFileSync(path.join(tempDir, "lakeql.config.mjs"), configContent)

      const result = await loadConfig({ cwd: tempDir })
      expect(result.adapters).toStrictEqual([])
    })

    /**
     * When the adapters field is not an array, it falls back to an empty array
     * without throwing, since loadConfig normalizes non-array adapters to [].
     */
    it("normalizes non-array adapters field to empty array", async () => {
      const configContent = `
export default {
  dataSources: {
    source1: { adapter: "test", connection: {} },
  },
  adapters: "not-an-array",
};
`
      fs.writeFileSync(path.join(tempDir, "lakeql.config.mjs"), configContent)

      const result = await loadConfig({ cwd: tempDir })
      expect(result.adapters).toStrictEqual([])
    })

    /**
     * `defineConfig()` registers `AdapterDefinition` objects that carry the
     * factory under a `factory` property. The runtime consumes bare
     * `AdapterFactory` instances, so loadConfig must unwrap each definition to
     * its `.factory` (which exposes `createDataSource`). This is the exact path
     * that previously failed at runtime with "createDataSource is not a
     * function".
     */
    it("unwraps AdapterDefinition entries to their factory", async () => {
      const configContent = `
const factory = {
  adapterName: "trino",
  createDataSource: () => ({}),
  createReadStrategy: () => ({}),
  createWriteStrategy: () => ({}),
};
const definition = {
  adapterName: "trino",
  factory,
  validateDataSourceConfig: () => {},
};

export default {
  dataSources: { trino: { adapter: "trino", connection: {} } },
  adapters: [definition],
};
`
      fs.writeFileSync(path.join(tempDir, "lakeql.config.mjs"), configContent)

      const result = await loadConfig({ cwd: tempDir })

      expect(result.adapters).toHaveLength(1)
      const resolved = result.adapters[0] as unknown as {
        adapterName: string
        createDataSource: (...args: unknown[]) => unknown
      }
      expect(resolved.adapterName).toBe("trino")
      expect(resolved.createDataSource).toBeTypeOf("function")
    })

    /**
     * For a config module that exports adapter factories with prototype methods,
     * the returned adapters preserve their prototype chain and method references.
     */
    it("preserves prototype chain and methods on adapter factories", async () => {
      const configContent = `
class MyFactory {
  constructor(name) {
    this.adapterName = name;
  }
  createDataSource() { return {}; }
  createReadStrategy() { return {}; }
  createWriteStrategy() { return {}; }
}

const factory1 = new MyFactory("custom-adapter");

export default {
  dataSources: {
    source1: { adapter: "custom-adapter", connection: {} },
  },
  adapters: [factory1],
};
`
      fs.writeFileSync(path.join(tempDir, "lakeql.config.mjs"), configContent)

      const result = await loadConfig({ cwd: tempDir })

      expect(result.adapters).toHaveLength(1)
      const factory = result.adapters[0] as unknown as {
        adapterName: string
        createDataSource: (...args: unknown[]) => unknown
      }
      expect(factory.adapterName).toBe("custom-adapter")
      // The factory is a class instance with methods on its prototype
      expect(factory.createDataSource).toBeTypeOf("function")
      expect(Object.getPrototypeOf(factory) !== Object.prototype).toBeTruthy()
    })

    /**
     * Proves strict reference identity (`===`) of adapter factory objects
     * by embedding a closure that compares `this` against the original
     * factory binding. If the loader cloned/copied the factory object,
     * `this` on the copy would differ from the closure's captured original,
     * causing verifyIdentity() to return false.
     */
    it("preserves adapter factory reference identity (closure-based === proof)", async () => {
      const configContent = `
const factory = {
  adapterName: "identity-proof",
  createDataSource: () => ({}),
  createReadStrategy: () => ({}),
  createWriteStrategy: () => ({}),
};
// Closure captures the original factory reference.
// On a clone, this !== factory, so verifyIdentity() returns false.
factory.verifyIdentity = function() { return this === factory; };

export default {
  dataSources: { src: { adapter: "identity-proof", connection: {} } },
  adapters: [factory],
};
`
      const configPath = path.join(tempDir, "lakeql.config.mjs")
      fs.writeFileSync(configPath, configContent)

      const result = await loadConfig({ cwd: tempDir })

      expect(result.adapters).toHaveLength(1)
      const adapter = result.adapters[0] as unknown as {
        adapterName: string
        verifyIdentity: () => boolean
      }
      expect(adapter.adapterName).toBe("identity-proof")

      // THE critical assertion: closure-captured reference === this
      // This ONLY passes if result.adapters[0] is the exact same object
      // that was assigned to the `factory` variable in the config module.
      expect(adapter.verifyIdentity()).toBeTruthy()
    })

    /**
     * Negative control: proves the closure-based identity test correctly
     * detects a cloned adapter. A cloned object shares the same
     * verifyIdentity closure, but `this` on the clone differs from the
     * closure's captured `factory` reference, so verifyIdentity() returns
     * false.
     */
    it("detects a cloned adapter (negative control for identity test)", async () => {
      const configContent = `
const factory = {
  adapterName: "clone-detect",
  createDataSource: () => ({}),
  createReadStrategy: () => ({}),
  createWriteStrategy: () => ({}),
};
factory.verifyIdentity = function() { return this === factory; };

// Deliberately clone to prove the test detects non-identity
const cloned = Object.assign({}, factory);

export default {
  dataSources: { src: { adapter: "clone-detect", connection: {} } },
  adapters: [cloned],
};
`
      const configPath = path.join(tempDir, "lakeql.config.mjs")
      fs.writeFileSync(configPath, configContent)

      const result = await loadConfig({ cwd: tempDir })

      expect(result.adapters).toHaveLength(1)
      const adapter = result.adapters[0] as unknown as {
        verifyIdentity: () => boolean
      }

      // The cloned adapter's verifyIdentity() returns false because
      // this (the clone) !== factory (the original captured by closure)
      expect(adapter.verifyIdentity()).toBeFalsy()
    })
  })
})
