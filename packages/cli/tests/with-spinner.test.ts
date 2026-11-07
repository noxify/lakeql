import { afterEach, describe, expect, it, vi } from "vitest"

import { withSpinner } from "../src/with-spinner"

describe(withSpinner, () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the value resolved by fn unchanged", async () => {
    const value = { catalogs: ["a", "b"] }
    const result = await withSpinner("Loading…", () => Promise.resolve(value))

    expect(result).toBe(value)
  })

  it("re-throws when fn rejects so downstream error mapping still runs", async () => {
    const error = new Error("network down")

    await expect(
      withSpinner("Loading…", () => Promise.reject(error))
    ).rejects.toThrow("network down")
  })

  it("runs fn with no stdout animation under the silent renderer", async () => {
    // Under Vitest, process.stdout.isTTY is undefined, so listrRendererOptions()
    // selects the silent renderer. Confirm fn still runs and nothing is written.
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true)
    const fn = vi.fn<() => Promise<string>>().mockResolvedValue("ok")

    const result = await withSpinner("Loading…", fn)

    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledOnce()
    expect(writeSpy).not.toHaveBeenCalled()
  })
})
