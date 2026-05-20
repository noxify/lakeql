import { describe, expect, test } from "vitest"

import { isObject, swap } from "../src/object-helper"

describe("Object helper", () => {
  test("swap", () => {
    expect(
      swap({
        a: "b",
        b: "c",
        c: "d",
      })
    ).toStrictEqual({
      b: "a",
      c: "b",
      d: "c",
    })
  })

  test("isObject - should return true", () => {
    // Should return true for plain objects
    expect(isObject({})).toBeTruthy()
    expect(isObject({ a: 1 })).toBeTruthy()
  })

  test("isObject - should return false", () => {
    // Should return false for non-objects
    expect(isObject(null)).toBeFalsy()
    // @ts-expect-error - should return false for undefined
    expect(isObject()).toBeFalsy()
    expect(isObject(42)).toBeFalsy()
    expect(isObject("string")).toBeFalsy()
    expect(isObject(true)).toBeFalsy()
  })

  test("isObject - should return false for complex types", () => {
    expect(isObject([])).toBeFalsy()
    expect(isObject(new Date())).toBeFalsy()
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isObject(() => {})).toBeFalsy()
  })
})
