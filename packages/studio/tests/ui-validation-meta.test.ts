import { describe, expect, it } from "vitest"

import {
  createValidation,
  isCustomPartitioning,
  offersPartitioningFormat,
  partitioningModeOf,
  validationError,
  validationKindsForType,
} from "@/ui/validation-meta"

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

describe("partitioning mode derivation (task 14)", () => {
  it("maps the boolean/string value to a mode", () => {
    expect(partitioningModeOf(true)).toBe("timestamp")
    expect(partitioningModeOf(false)).toBe("off")
    expect(partitioningModeOf("created_at")).toBe("field")
    expect(partitioningModeOf("year/month")).toBe("field")
  })

  it("detects custom partition strings", () => {
    expect(isCustomPartitioning(true)).toBeFalsy()
    expect(isCustomPartitioning(false)).toBeFalsy()
    expect(isCustomPartitioning("created_at")).toBeFalsy()
    expect(isCustomPartitioning("year/month")).toBeTruthy()
    expect(isCustomPartitioning("created_at:day")).toBeTruthy()
  })

  it("offers partitioningFormat only in non-custom, enabled modes", () => {
    expect(offersPartitioningFormat(true)).toBeTruthy()
    expect(offersPartitioningFormat("created_at")).toBeTruthy()
    expect(offersPartitioningFormat(false)).toBeFalsy()
    expect(offersPartitioningFormat("year/month/day")).toBeFalsy()
    expect(offersPartitioningFormat("created_at:day")).toBeFalsy()
  })

  it("hides the format control for the transient empty 'field' seed", () => {
    // Entering field mode seeds "", which is incomplete, not a legacy
    // single-field string — the granularity select must stay hidden until a
    // field name is typed.
    expect(offersPartitioningFormat("")).toBeFalsy()
  })
})
