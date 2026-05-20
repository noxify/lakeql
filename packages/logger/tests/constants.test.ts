import { beforeEach, describe, expect, test, vi } from "vitest"

// Import after mocks
import { SYMBOLS } from "../src/constants"
import * as utils from "../src/utils"

// Mock the utils module
vi.mock(import("../src/utils"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    isUnicodeSupported: vi.fn<
      () => boolean
    >() as unknown as typeof actual.isUnicodeSupported,
  }
})

// Mock kleur to avoid ANSI color issues in tests
vi.mock(import("kleur"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    default: {
      blue: () => ({ bold: (text: string) => `blue_bold_${text}` }),
      cyan: (text: string) => `cyan_${text}`,
      gray: (text: string) => `gray_${text}`,
      green: () => ({ bold: (text: string) => `green_bold_${text}` }),
      red: () => ({ bold: (text: string) => `red_bold_${text}` }),
    } as unknown as typeof actual.default,
  }
})

describe("constants", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test("should export all required symbols", () => {
    expect(SYMBOLS).toHaveProperty("QuestionMark")
    expect(SYMBOLS).toHaveProperty("Tick")
    expect(SYMBOLS).toHaveProperty("Cross")
    expect(SYMBOLS).toHaveProperty("Pointer")
    expect(SYMBOLS).toHaveProperty("Previous")
  })

  test("should export all required symbols (continued)", () => {
    expect(SYMBOLS).toHaveProperty("Next")
    expect(SYMBOLS).toHaveProperty("ShowCursor")
    expect(SYMBOLS).toHaveProperty("HideCursor")
    expect(SYMBOLS).toHaveProperty("Active")
    expect(SYMBOLS).toHaveProperty("Inactive")
  })

  test("should use main symbols when unicode is supported", async () => {
    // Set isUnicodeSupported to return true
    vi.mocked(utils.isUnicodeSupported).mockReturnValue(true)

    // Force re-import of the module
    vi.resetModules()
    // oxlint-disable-next-line no-shadow
    const { SYMBOLS } = await import("../src/constants")

    // Check the symbols
    expect(SYMBOLS.Tick).toBe("green_bold_✔")
    expect(SYMBOLS.Cross).toBe("red_bold_✖")
  })

  test("should use fallback symbols when unicode is not supported", async () => {
    // Set isUnicodeSupported to return false
    vi.mocked(utils.isUnicodeSupported).mockReturnValue(false)
    vi.stubEnv("CI", "")

    // Force re-import of the module
    vi.resetModules()
    // oxlint-disable-next-line no-shadow
    const { SYMBOLS } = await import("../src/constants")

    // Check the symbols
    expect(SYMBOLS.Tick).toBe("green_bold_√")
    expect(SYMBOLS.Cross).toBe("red_bold_×")
  })
})
