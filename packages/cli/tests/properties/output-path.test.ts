// oxlint-disable import/no-named-as-default-member
// Feature: custom-endpoint-cli, Property 6: Output path construction follows convention

import path from "node:path"

import fc from "fast-check"
import { describe, it, expect } from "vitest"

import { computeOutputDir } from "../../src/pipeline/compute-output-dir"

// --- Arbitraries ---

/** Generate a valid metadata field matching /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/ */
const metadataFieldArb = fc
  .tuple(
    fc.string({
      unit: fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"
      ),
      minLength: 1,
      maxLength: 1,
    }),
    fc.string({
      unit: fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"
      ),
      minLength: 0,
      maxLength: 15,
    })
  )
  .map(([first, rest]: [string, string]) => first + rest)

/** Generate a valid resolved source path (absolute path) */
const resolvedSourcePathArb = fc
  .tuple(
    fc.constantFrom("/", "/home/", "/usr/local/", "/opt/", "/var/"),
    fc.array(
      fc.string({
        unit: fc.constantFrom(
          ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
        ),
        minLength: 1,
        maxLength: 12,
      }),
      { minLength: 1, maxLength: 4 }
    )
  )
  .map(([prefix, segments]: [string, string[]]) => prefix + segments.join("/"))

// --- Tests ---

describe("Property 6: Output path construction follows convention", () => {
  it("output directory equals path.join(resolvedSourcePath, 'schemas/generated', catalog, schema, tableName)", () => {
    fc.assert(
      fc.property(
        resolvedSourcePathArb,
        metadataFieldArb,
        metadataFieldArb,
        metadataFieldArb,
        (resolvedSourcePath, catalog, schema, tableName) => {
          const result = computeOutputDir(
            resolvedSourcePath,
            catalog,
            schema,
            tableName
          )

          const expected = path.join(
            resolvedSourcePath,
            "schemas/generated",
            catalog,
            schema,
            tableName
          )

          expect(result).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("output path always contains the 'schemas/generated' segment", () => {
    fc.assert(
      fc.property(
        resolvedSourcePathArb,
        metadataFieldArb,
        metadataFieldArb,
        metadataFieldArb,
        (resolvedSourcePath, catalog, schema, tableName) => {
          const result = computeOutputDir(
            resolvedSourcePath,
            catalog,
            schema,
            tableName
          )

          expect(result).toContain("schemas/generated")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("output path ends with catalog/schema/tableName", () => {
    fc.assert(
      fc.property(
        resolvedSourcePathArb,
        metadataFieldArb,
        metadataFieldArb,
        metadataFieldArb,
        (resolvedSourcePath, catalog, schema, tableName) => {
          const result = computeOutputDir(
            resolvedSourcePath,
            catalog,
            schema,
            tableName
          )

          const expectedSuffix = path.join(catalog, schema, tableName)
          expect(result).toMatch(
            new RegExp(`${expectedSuffix.replaceAll("/", "\\/")}$`, "u")
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it("output path starts with the resolved source path", () => {
    fc.assert(
      fc.property(
        resolvedSourcePathArb,
        metadataFieldArb,
        metadataFieldArb,
        metadataFieldArb,
        (resolvedSourcePath, catalog, schema, tableName) => {
          const result = computeOutputDir(
            resolvedSourcePath,
            catalog,
            schema,
            tableName
          )

          expect(result.startsWith(resolvedSourcePath)).toBeTruthy()
        }
      ),
      { numRuns: 100 }
    )
  })
})
