import { describe, expect, it } from "vitest"

import { error, success } from "../src/console"
import { SYMBOLS } from "../src/constants"

describe("console", () => {
  it("success should format message with tick symbol", () => {
    const message = "Operation completed"
    const result = success(message)
    expect(result).toBe(`${SYMBOLS.Tick} ${message}`)
  })

  it("error should format message with cross symbol", () => {
    const message = "Operation failed"
    const result = error(message)
    expect(result).toBe(`${SYMBOLS.Cross} ${message}`)
  })
})
