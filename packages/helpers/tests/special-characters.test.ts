import { describe, expect, test } from "vitest"

import replaceSpecialCharacters from "../src/special-characters"

describe("Replace special characters", () => {
  test("Replace ä with ae", () => {
    expect(replaceSpecialCharacters("ä")).toBe("ae")
  })
  test("Replace Ä with AE", () => {
    expect(replaceSpecialCharacters("Ä")).toBe("AE")
  })

  test("Replace ö with oe", () => {
    expect(replaceSpecialCharacters("ä")).toBe("ae")
  })
  test("Replace Ö with OE", () => {
    expect(replaceSpecialCharacters("Ö")).toBe("OE")
  })

  test("Replace ü with ue", () => {
    expect(replaceSpecialCharacters("ä")).toBe("ae")
  })
  test("Replace Ü with UE", () => {
    expect(replaceSpecialCharacters("Ü")).toBe("UE")
  })

  test("Replace ß with ss", () => {
    expect(replaceSpecialCharacters("ß")).toBe("ss")
  })
})
