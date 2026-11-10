import { describe, expect, it } from "vitest"

import {
  arrayItemTypeOptions,
  fieldNameError,
  fieldTypeOptions,
  metadataFieldError,
} from "@/ui/field-meta"

describe("field type option lists", () => {
  it("offers the six primitives plus Object and Array as field types", () => {
    expect(fieldTypeOptions).toStrictEqual([
      "String",
      "Integer",
      "Float",
      "Boolean",
      "Date",
      "DateTime",
      "Object",
      "Array",
    ])
  })

  it("offers Object but never Array as an array item type", () => {
    expect(arrayItemTypeOptions).toContain("Object")
    expect(arrayItemTypeOptions).not.toContain("Array")
    // The six primitives are still offered.
    expect(arrayItemTypeOptions).toContain("String")
    expect(arrayItemTypeOptions).toContain("DateTime")
  })
})

describe("metadata field validation", () => {
  it("treats an empty value as incomplete, not an error", () => {
    expect(metadataFieldError("")).toBeUndefined()
  })

  it("accepts a valid identifier", () => {
    expect(metadataFieldError("my_table")).toBeUndefined()
    expect(metadataFieldError("_catalog1")).toBeUndefined()
  })

  it("rejects a leading digit and reports the rule", () => {
    expect(metadataFieldError("1table")).toBeDefined()
  })

  it("rejects illegal characters", () => {
    expect(metadataFieldError("my-table")).toBeDefined()
    expect(metadataFieldError("has space")).toBeDefined()
  })

  it("rejects a value over 128 characters", () => {
    expect(metadataFieldError("a".repeat(129))).toBeDefined()
    expect(metadataFieldError("a".repeat(128))).toBeUndefined()
  })
})

describe("field name validation", () => {
  it("treats an empty value as incomplete", () => {
    expect(fieldNameError("")).toBeUndefined()
  })

  it("accepts a valid field name", () => {
    expect(fieldNameError("first_name")).toBeUndefined()
  })

  it("rejects a value over 64 characters", () => {
    expect(fieldNameError("a".repeat(65))).toBeDefined()
    expect(fieldNameError("a".repeat(64))).toBeUndefined()
  })

  it("rejects a leading digit", () => {
    expect(fieldNameError("2nd")).toBeDefined()
  })
})
