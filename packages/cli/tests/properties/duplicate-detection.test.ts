// oxlint-disable unicorn/no-useless-spread
// oxlint-disable typescript/no-non-null-assertion
// Feature: custom-endpoint-cli, Property 3: Duplicate field detection at same nesting level

import * as fc from "fast-check"
import { describe, expect, test } from "vitest"

import { findDuplicateFieldNames } from "../../src/pipeline/schema"
import type { FieldDefinition } from "../../src/pipeline/schema"

// --- Generators ---

/** Generates a valid field name matching /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/ */
const validFieldNameArb = fc
  .tuple(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"),
    fc.string({
      unit: fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"
      ),
      minLength: 0,
      maxLength: 10,
    })
  )
  .map(([first, rest]: [string, string]) => first + rest)

/** Generates a primitive field definition */
const _primitiveFieldArb = (
  name: fc.Arbitrary<string>
): fc.Arbitrary<FieldDefinition> =>
  fc
    .tuple(
      name,
      fc.constantFrom(
        "String",
        "Integer",
        "Float",
        "Boolean",
        "Date",
        "DateTime" as const
      )
    )
    .map(
      ([n, type]: [string, string]) => ({ name: n, type }) as FieldDefinition
    )

/** Generates an array of unique field names */
const uniqueFieldNamesArb = (minLength: number, maxLength: number) =>
  fc.uniqueArray(validFieldNameArb, {
    minLength,
    maxLength,
    comparator: (a, b) => a === b,
  })

/**
 * Generates a flat list of fields with at least one duplicate name at the same level.
 * Strategy: generate unique fields, then duplicate one of them.
 */
const fieldsWithDuplicateArb: fc.Arbitrary<{
  fields: FieldDefinition[]
  duplicatedName: string
}> = uniqueFieldNamesArb(1, 8).chain((uniqueNames) =>
  // Pick one name to duplicate
  fc.integer({ min: 0, max: uniqueNames.length - 1 }).chain((dupIndex) => {
    const duplicatedName = uniqueNames[dupIndex]!
    // Create fields: all unique names as primitives, then add a duplicate
    return fc
      .constantFrom(
        "String",
        "Integer",
        "Float",
        "Boolean",
        "Date",
        "DateTime" as const
      )
      .map((dupType) => {
        const fields: FieldDefinition[] = uniqueNames.map((name) => ({
          name,
          type: "String" as const,
        }))
        // Insert the duplicate at a random-ish position (end)
        fields.push({
          name: duplicatedName,
          type: dupType,
        } as FieldDefinition)
        return { fields, duplicatedName }
      })
  })
)

/**
 * Generates an Object field containing nested fields with a duplicate.
 */
const nestedObjectWithDuplicateArb: fc.Arbitrary<{
  field: FieldDefinition
  duplicatedName: string
  parentName: string
}> = fc
  .tuple(validFieldNameArb, fieldsWithDuplicateArb)
  .map(
    ([parentName, { fields, duplicatedName }]: [
      string,
      { fields: FieldDefinition[]; duplicatedName: string },
    ]) => ({
      field: { name: parentName, type: "Object" as const, fields },
      duplicatedName,
      parentName,
    })
  )

/**
 * Generates an Array field with Object items containing nested fields with a duplicate.
 */
const nestedArrayItemObjectWithDuplicateArb: fc.Arbitrary<{
  field: FieldDefinition
  duplicatedName: string
  parentName: string
}> = fc
  .tuple(validFieldNameArb, fieldsWithDuplicateArb)
  .map(
    ([parentName, { fields, duplicatedName }]: [
      string,
      { fields: FieldDefinition[]; duplicatedName: string },
    ]) => ({
      field: {
        name: parentName,
        type: "Array" as const,
        items: { type: "Object" as const, fields },
      },
      duplicatedName,
      parentName,
    })
  )

// --- Property Tests ---

describe("Property 3: Duplicate field detection at same nesting level", () => {
  test("detects duplicates at root level for any field list with repeated names", () => {
    fc.assert(
      fc.property(fieldsWithDuplicateArb, ({ fields, duplicatedName }) => {
        const duplicates = findDuplicateFieldNames(fields)
        // Must detect at least one duplicate
        expect(duplicates.length).toBeGreaterThanOrEqual(1)
        // The duplicated name must be reported
        const reportedNames = duplicates.map((d) => d.name)
        expect(reportedNames).toContain(duplicatedName)
        // The path for root-level duplicates should be empty
        const rootDups = duplicates.filter((d) => d.path.length === 0)
        expect(rootDups.some((d) => d.name === duplicatedName)).toBeTruthy()
      }),
      { numRuns: 100 }
    )
  })

  test("reports no duplicates for fields with all unique names at same level", () => {
    fc.assert(
      fc.property(
        uniqueFieldNamesArb(1, 10).map((names) =>
          names.map(
            (name) => ({ name, type: "String" as const }) as FieldDefinition
          )
        ),
        (fields) => {
          const duplicates = findDuplicateFieldNames(fields)
          expect(duplicates).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  test("detects duplicates within nested Object fields", () => {
    fc.assert(
      fc.property(
        nestedObjectWithDuplicateArb,
        ({ field, duplicatedName, parentName }) => {
          // Wrap in a root-level array with the object field
          const fields: FieldDefinition[] = [field]
          const duplicates = findDuplicateFieldNames(fields)

          // Must report the duplicate in the nested level
          expect(duplicates.length).toBeGreaterThanOrEqual(1)
          const nestedDups = duplicates.filter(
            (d) => d.path.length === 1 && d.path[0] === parentName
          )
          expect(nestedDups.some((d) => d.name === duplicatedName)).toBeTruthy()
        }
      ),
      { numRuns: 100 }
    )
  })

  test("detects duplicates within nested Array item Object fields", () => {
    fc.assert(
      fc.property(
        nestedArrayItemObjectWithDuplicateArb,
        ({ field, duplicatedName, parentName }) => {
          const fields: FieldDefinition[] = [field]
          const duplicates = findDuplicateFieldNames(fields)

          // Must report the duplicate within the array item's object fields
          expect(duplicates.length).toBeGreaterThanOrEqual(1)
          const arrayItemDups = duplicates.filter(
            (d) =>
              d.path.length === 2 &&
              d.path[0] === parentName &&
              d.path[1] === "items"
          )
          expect(
            arrayItemDups.some((d) => d.name === duplicatedName)
          ).toBeTruthy()
        }
      ),
      { numRuns: 100 }
    )
  })

  test("same name at different nesting levels is NOT a duplicate", () => {
    fc.assert(
      fc.property(validFieldNameArb, (sharedName) => {
        // A field at root and a field with the same name nested inside an Object
        const fields: FieldDefinition[] = [
          { name: sharedName, type: "String" },
          {
            name: "parent_obj",
            type: "Object",
            fields: [{ name: sharedName, type: "Integer" }],
          },
        ]
        const duplicates = findDuplicateFieldNames(fields)

        // No duplicates should be found at either level (each level has unique names)
        const rootDups = duplicates.filter((d) => d.path.length === 0)
        const nestedDups = duplicates.filter(
          (d) => d.path.length === 1 && d.path[0] === "parent_obj"
        )
        expect(rootDups).toHaveLength(0)
        expect(nestedDups).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })
})
