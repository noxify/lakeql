import { describe, expect, it } from "vitest"

import { generateFlatPath } from "../src/write-pipeline"

// UUID v4 pattern
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

describe(generateFlatPath, () => {
  it("returns <uuid>.parquet", () => {
    const result = generateFlatPath()

    expect(result).toMatch(/^[0-9a-f-]+\.parquet$/u)
  })

  it("contains a valid UUID v4", () => {
    const result = generateFlatPath()
    const uuid = result.replace(".parquet", "")

    expect(uuid).toMatch(uuidV4Pattern)
  })

  it("generates unique paths on each call", () => {
    const result1 = generateFlatPath()
    const result2 = generateFlatPath()

    expect(result1).not.toBe(result2)
  })
})
