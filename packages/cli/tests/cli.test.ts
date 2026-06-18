import { Command } from "@commander-js/extra-typings"
import { afterEach, describe, expect, test, vi } from "vitest"

const { runCli } = await import("../src/run-cli")

describe("CLI entrypoint", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("exits successfully when invoked without arguments", async () => {
    const outputHelpSpy = vi
      .spyOn(Command.prototype, "outputHelp")
      .mockImplementation(() => {})

    const exitCode = await runCli([], { version: "1.0.0" })

    expect(exitCode).toBe(0)
    expect(outputHelpSpy).toHaveBeenCalledOnce()
  })
})
