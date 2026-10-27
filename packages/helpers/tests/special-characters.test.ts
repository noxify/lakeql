import { describe, expect, it } from "vitest"

import replaceSpecialCharacters from "../src/special-characters"

describe("Replace special characters", () => {
  it("Replace ä with ae", () => {
    expect(replaceSpecialCharacters("ä")).toBe("ae")
  })

  it("Replace Ä with AE", () => {
    expect(replaceSpecialCharacters("Ä")).toBe("AE")
  })

  it("Replace ö with oe", () => {
    expect(replaceSpecialCharacters("ä")).toBe("ae")
  })

  it("Replace Ö with OE", () => {
    expect(replaceSpecialCharacters("Ö")).toBe("OE")
  })

  it("Replace ü with ue", () => {
    expect(replaceSpecialCharacters("ä")).toBe("ae")
  })

  it("Replace Ü with UE", () => {
    expect(replaceSpecialCharacters("Ü")).toBe("UE")
  })

  it("Replace ß with ss", () => {
    expect(replaceSpecialCharacters("ß")).toBe("ss")
  })
})
