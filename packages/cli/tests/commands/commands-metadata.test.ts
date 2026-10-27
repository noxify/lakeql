import { describe, expect, it } from "vitest"

import { getCommandConfig } from "@/commands-metadata"

describe("commands metadata", () => {
  it("keeps option requirements stable across command extraction order", () => {
    const before = getCommandConfig("list-tables").options.find(
      (option) => option.long === "--schema"
    )

    expect(before?.required).toBeFalsy()

    getCommandConfig("list-columns")

    const after = getCommandConfig("list-tables").options.find(
      (option) => option.long === "--schema"
    )

    expect(after?.required).toBeFalsy()
  })
})
