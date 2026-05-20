import * as prettier from "prettier"
import { beforeEach, describe, expect, test, vi } from "vitest"

import formatCode from "../src/format-code"

const mocks = vi.hoisted(() => ({
  namedExport: vi.fn<() => void>(),
}))

// Mock the entire prettier module
vi.mock(import("prettier"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    format: mocks.namedExport as unknown as typeof actual.format,
  }
})

describe(formatCode, () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("formats code correctly", async () => {
    const unformattedCode = "const x=1;const y=2;"
    const formattedCode = "const x = 1;\nconst y = 2;\n"
    vi.mocked(prettier.format).mockResolvedValueOnce(formattedCode)

    const result = await formatCode(unformattedCode)
    expect(result).toBe(formattedCode)
  })

  test("returns original code when formatting fails", async () => {
    const unformattedCode = "const x=1;const y=2;"
    // Set up the mock to throw an error
    vi.mocked(prettier.format).mockRejectedValueOnce(
      new Error("Formatting error")
    )

    // Spy on console.error
    // oxlint-disable-next-line no-empty-function
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {})

    const result = await formatCode(unformattedCode)

    // Verify original code is returned
    expect(result).toBe(unformattedCode)

    // Verify error is logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Unable to format the code - fallback to given value"
    )

    // Restore console.error
    consoleErrorSpy.mockRestore()
  })
})
