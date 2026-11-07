import { describe, expect, it } from "vitest"

import { validateTrinoWriteConfig } from "../src/config"

describe(validateTrinoWriteConfig, () => {
  describe("strategy discriminator", () => {
    it("accepts an absent strategy (defaults to storage)", () => {
      expect(() => validateTrinoWriteConfig({})).not.toThrow()
    })

    it("accepts strategy: storage without validating its fields", () => {
      expect(() =>
        validateTrinoWriteConfig({ strategy: "storage", files: {} })
      ).not.toThrow()
    })

    it("accepts strategy: insert", () => {
      expect(() =>
        validateTrinoWriteConfig({ strategy: "insert" })
      ).not.toThrow()
    })

    it("rejects an unknown strategy", () => {
      expect(() => validateTrinoWriteConfig({ strategy: "copy" })).toThrow(
        /unknown strategy/iu
      )
    })

    it("rejects a non-object writeConfig", () => {
      expect(() => validateTrinoWriteConfig(null)).toThrow(/plain object/iu)
      expect(() => validateTrinoWriteConfig(42)).toThrow(/plain object/iu)
    })
  })

  describe("insert strategy options", () => {
    it("accepts valid insert options", () => {
      expect(() =>
        validateTrinoWriteConfig({
          strategy: "insert",
          batchSize: 500,
          autoCreateTable: true,
          tableProperties: { format: "PARQUET" },
        })
      ).not.toThrow()
    })

    it("rejects surplus fields for the insert strategy", () => {
      expect(() =>
        validateTrinoWriteConfig({ strategy: "insert", files: {} })
      ).toThrow(/unexpected field/iu)
    })

    it("rejects a non-positive or non-integer batchSize", () => {
      expect(() =>
        validateTrinoWriteConfig({ strategy: "insert", batchSize: 0 })
      ).toThrow(/batchSize/iu)
      expect(() =>
        validateTrinoWriteConfig({ strategy: "insert", batchSize: -5 })
      ).toThrow(/batchSize/iu)
      expect(() =>
        validateTrinoWriteConfig({ strategy: "insert", batchSize: 1.5 })
      ).toThrow(/batchSize/iu)
    })

    it("rejects a non-boolean autoCreateTable", () => {
      expect(() =>
        validateTrinoWriteConfig({
          strategy: "insert",
          autoCreateTable: "yes",
        })
      ).toThrow(/autoCreateTable/iu)
    })

    it("rejects non-object tableProperties", () => {
      expect(() =>
        validateTrinoWriteConfig({
          strategy: "insert",
          tableProperties: "x",
        })
      ).toThrow(/tableProperties/iu)
    })

    it("rejects unsafe table property keys", () => {
      expect(() =>
        validateTrinoWriteConfig({
          strategy: "insert",
          tableProperties: { "bad key": "v" },
        })
      ).toThrow(/safe identifier/iu)
    })
  })
})
