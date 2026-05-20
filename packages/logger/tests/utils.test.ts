/* eslint-disable turbo/no-undeclared-env-vars */
/* eslint-disable no-restricted-properties */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import {
  ansiRegex,
  isUnicodeSupported,
  stringLength,
  stripAnsi,
} from "../src/utils"

describe("utils", () => {
  describe(ansiRegex, () => {
    test("should return a RegExp object", () => {
      const regex = ansiRegex()
      expect(regex).toBeInstanceOf(RegExp)
    })

    test("should match ANSI escape codes", () => {
      const regex = ansiRegex()
      expect("\u001B[4mcake\u001B[0m".match(regex)).toBeTruthy()
      expect("\u001B[4mcake\u001B[0m".match(regex)?.length).toBeGreaterThan(0)
    })

    test("should support onlyFirst option", () => {
      const regex = ansiRegex({ onlyFirst: true })
      const matches = "\u001B[4mcake\u001B[0m".match(regex)
      expect(matches?.length).toBe(1)
    })
  })

  describe(stripAnsi, () => {
    test("should remove ANSI escape codes", () => {
      expect(stripAnsi("\u001B[4mcake\u001B[0m")).toBe("cake")
      expect(
        stripAnsi(
          "\u001B[0m\u001B[4m\u001B[42m\u001B[31mfoo\u001B[39m\u001B[49m\u001B[24m"
        )
      ).toBe("foo")
    })

    test("should not alter strings without ANSI codes", () => {
      expect(stripAnsi("plain text")).toBe("plain text")
    })
  })

  describe(stringLength, () => {
    test("should return 0 for empty string", () => {
      expect(stringLength("")).toBe(0)
    })

    test("should return correct length for ASCII string", () => {
      expect(stringLength("hello")).toBe(5)
    })

    test("should return correct length for string with emoji", () => {
      expect(stringLength("👋 hello")).toBe(7)
    })

    test("should ignore ANSI escape codes", () => {
      expect(stringLength("\u001B[4mcake\u001B[0m")).toBe(4)
    })

    test("should handle complex unicode characters correctly", () => {
      // Test with combining characters
      expect(stringLength("é")).toBe(1) // e + acute accent
      expect(stringLength("👨‍👩‍👧‍👦")).toBe(1) // family emoji (multiple code points)

      // Test with zero-width characters
      const stringWithZeroWidth = "a\u200Bb" // zero-width space between a and b
      expect(stringLength(stringWithZeroWidth)).toBe(3)
    })
  })

  describe(isUnicodeSupported, () => {
    const originalEnv = process.env

    beforeEach(() => {
      vi.resetModules()
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    test("should return true for non-Windows with supported TERM", () => {
      Object.defineProperty(process, "platform", { value: "darwin" })
      process.env.TERM = "xterm-256color"
      expect(isUnicodeSupported()).toBeTruthy()
    })

    test("should return false for non-Windows with linux TERM", () => {
      Object.defineProperty(process, "platform", { value: "darwin" })
      process.env.TERM = "linux"
      expect(isUnicodeSupported()).toBeFalsy()
    })

    test("should return true for Windows with WT_SESSION", () => {
      Object.defineProperty(process, "platform", { value: "win32" })
      process.env.WT_SESSION = "1"
      expect(isUnicodeSupported()).toBeTruthy()
    })

    test("should return true for Windows with supported terminal", () => {
      Object.defineProperty(process, "platform", { value: "win32" })
      process.env.TERM_PROGRAM = "vscode"
      expect(isUnicodeSupported()).toBeTruthy()
    })
  })
})
