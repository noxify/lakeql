import { describe, expect, test } from "vitest"

import { error, success } from "../src/console"
import { SYMBOLS } from "../src/constants"

describe("console", () => {
  test("success should format message with tick symbol", () => {
    const message = "Operation completed"
    const result = success(message)
    expect(result).toBe(`${SYMBOLS.Tick} ${message}`)
  })

  test("error should format message with cross symbol", () => {
    const message = "Operation failed"
    const result = error(message)
    expect(result).toBe(`${SYMBOLS.Cross} ${message}`)
  })
})
