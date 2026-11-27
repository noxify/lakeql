import { describe, expect, it } from "vitest"

import {
  createValidation,
  validationError,
  validationKindsForType,
} from "@/components/studio/validation-meta"

describe("validation kinds per field type (task 13)", () => {
  it("offers all refinements for String", () => {
    expect(validationKindsForType("String")).toStrictEqual([
      "email",
      "url",
      "uuid",
      "min",
      "max",
      "regex",
    ])
  })

  it("offers only numeric bounds for Integer and Float", () => {
    expect(validationKindsForType("Integer")).toStrictEqual(["min", "max"])
    expect(validationKindsForType("Float")).toStrictEqual(["min", "max"])
  })

  it("offers no refinements for Boolean, Object, or Array", () => {
    expect(validationKindsForType("Boolean")).toStrictEqual([])
    expect(validationKindsForType("Object")).toStrictEqual([])
    expect(validationKindsForType("Array")).toStrictEqual([])
  })
})

describe("validation defaults", () => {
  it("seeds min/max incomplete (NaN)", () => {
    const min = createValidation("min")
    expect(min.type).toBe("min")
    expect(Number.isNaN((min as { value: number }).value)).toBeTruthy()
    const max = createValidation("max")
    expect(max.type).toBe("max")
    expect(Number.isNaN((max as { value: number }).value)).toBeTruthy()
  })

  it("seeds regex with an empty pattern and value-less kinds bare", () => {
    expect(createValidation("regex")).toStrictEqual({
      type: "regex",
      pattern: "",
    })
    expect(createValidation("email")).toStrictEqual({ type: "email" })
  })

  it("seeds a min/max entry that the export gate blocks until filled", () => {
    // A freshly added numeric bound is incomplete (NaN), so its inline error
    // fires and — via the gate's finiteness check — Export stays blocked.
    expect(validationError(createValidation("min"))).toBeDefined()
    expect(validationError(createValidation("max"))).toBeDefined()
  })
})

describe("validation error surfacing", () => {
  it("accepts a well-formed refinement", () => {
    expect(validationError({ type: "email" })).toBeUndefined()
    expect(validationError({ type: "min", value: 3 })).toBeUndefined()
    expect(validationError({ type: "regex", pattern: "^a+$" })).toBeUndefined()
  })

  it("flags an empty regex pattern", () => {
    expect(validationError({ type: "regex", pattern: "" })).toBeDefined()
  })

  it("flags an unconstructible regex pattern (matches the export gate)", () => {
    const error = validationError({ type: "regex", pattern: "(" })
    expect(error).toBeDefined()
    expect(error).toContain("constructible")
  })

  it("flags a non-numeric min/max value", () => {
    expect(validationError({ type: "min", value: Number.NaN })).toBeDefined()
  })
})
