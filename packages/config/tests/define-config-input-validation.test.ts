// oxlint-disable typescript/no-explicit-any
// oxlint-disable vitest/no-conditional-expect

import { describe, expect, it } from "vitest"

import { DataSourceConfigError, defineConfig } from "../src/index"

/**
 * Minimal valid adapter definition for tests that need valid adapters
 * but are exercising dataSources validation paths.
 */
function makeAdapter(name: string) {
  return {
    adapterName: name,
    factory: {
      adapterName: name,
      createDataSource: () => {},
      createReadStrategy: () => {},
      createWriteStrategy: () => {},
    },
    validateDataSourceConfig: () => {},
  }
}

/**
 * Calls defineConfig with an untyped input to exercise runtime validation
 * of structurally malformed arguments.
 */
function callWithInvalid(input: unknown) {
  return (defineConfig as (...args: any[]) => unknown)(input)
}

describe("defineConfig() - top-level input validation", () => {
  it("throws TypeError when adapters is missing", () => {
    expect(() => callWithInvalid({ dataSources: {} })).toThrow(TypeError)
  })

  it("throws TypeError when adapters is not an array", () => {
    expect(() =>
      callWithInvalid({ adapters: "not-an-array", dataSources: {} })
    ).toThrow(TypeError)
  })

  it("throws TypeError when dataSources is missing", () => {
    expect(() => callWithInvalid({ adapters: [makeAdapter("a")] })).toThrow(
      TypeError
    )
  })

  it("throws TypeError when dataSources is not an object", () => {
    expect(() =>
      callWithInvalid({ adapters: [makeAdapter("a")], dataSources: 42 })
    ).toThrow(TypeError)
  })

  it("throws TypeError when dataSources is an array", () => {
    expect(() =>
      callWithInvalid({ adapters: [makeAdapter("a")], dataSources: [] })
    ).toThrow(TypeError)
  })

  it("throws TypeError when an adapter entry is null", () => {
    expect(() =>
      callWithInvalid({ adapters: [null], dataSources: {} })
    ).toThrow(TypeError)
  })

  it("throws DataSourceConfigError when a data-source entry is null", () => {
    expect(() =>
      callWithInvalid({
        adapters: [makeAdapter("a")],
        dataSources: { mySource: null },
      })
    ).toThrow(DataSourceConfigError)

    try {
      callWithInvalid({
        adapters: [makeAdapter("a")],
        dataSources: { mySource: null },
      })
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DataSourceConfigError)
      expect((error as DataSourceConfigError).sourceName).toBe("mySource")
    }
  })

  it("throws DataSourceConfigError when a data-source entry is not an object", () => {
    expect(() =>
      callWithInvalid({
        adapters: [makeAdapter("a")],
        dataSources: { analytics: 123 },
      })
    ).toThrow(DataSourceConfigError)

    try {
      callWithInvalid({
        adapters: [makeAdapter("a")],
        dataSources: { analytics: 123 },
      })
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DataSourceConfigError)
      expect((error as DataSourceConfigError).sourceName).toBe("analytics")
    }
  })

  it("throws TypeError when dataSources is a Date", () => {
    expect(() =>
      callWithInvalid({
        adapters: [makeAdapter("a")],
        dataSources: new Date(),
      })
    ).toThrow(TypeError)
  })

  it("throws TypeError when dataSources is a Map", () => {
    expect(() =>
      callWithInvalid({
        adapters: [makeAdapter("a")],
        dataSources: new Map(),
      })
    ).toThrow(TypeError)
  })

  it("throws TypeError when dataSources has a custom prototype", () => {
    const customProto = { customMethod() {} }
    const customObj = Object.create(customProto) as Record<string, unknown>

    expect(() =>
      callWithInvalid({
        adapters: [makeAdapter("a")],
        dataSources: customObj,
      })
    ).toThrow(TypeError)
  })

  it("accepts dataSources with null prototype", () => {
    const nullProtoObj = Object.create(null) as Record<string, unknown>
    nullProtoObj.mySource = {
      adapter: "a",
      connection: { host: "localhost" },
    }

    expect(() =>
      callWithInvalid({
        adapters: [makeAdapter("a")],
        dataSources: nullProtoObj,
      })
    ).not.toThrow()
  })
})
