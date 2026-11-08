/* eslint-disable turbo/no-undeclared-env-vars */
/* eslint-disable no-restricted-properties */
import { afterEach, beforeEach, describe, expect, vi, it } from "vitest"

import { isUnicodeSupported } from "../src/utils"

describe("utils", () => {
  describe(isUnicodeSupported, () => {
    const originalEnv = process.env

    beforeEach(() => {
      vi.resetModules()
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it("should return true for non-Windows with supported TERM", () => {
      Object.defineProperty(process, "platform", { value: "darwin" })
      process.env.TERM = "xterm-256color"
      expect(isUnicodeSupported()).toBeTruthy()
    })

    it("should return false for non-Windows with linux TERM", () => {
      Object.defineProperty(process, "platform", { value: "darwin" })
      process.env.TERM = "linux"
      expect(isUnicodeSupported()).toBeFalsy()
    })

    it("should return true for Windows with WT_SESSION", () => {
      Object.defineProperty(process, "platform", { value: "win32" })
      process.env.WT_SESSION = "1"
      expect(isUnicodeSupported()).toBeTruthy()
    })

    it("should return true for Windows with supported terminal", () => {
      Object.defineProperty(process, "platform", { value: "win32" })
      process.env.TERM_PROGRAM = "vscode"
      expect(isUnicodeSupported()).toBeTruthy()
    })
  })
})
