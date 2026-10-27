import type { AdapterFactory, AdapterName } from "@lakeql/datasource"
import { describe, expectTypeOf, it } from "vitest"

import {
  AdapterRegistry,
  DuplicateAdapterError,
  UnknownAdapterError,
} from "../src/index"

describe("AdapterRegistry type-level tests", () => {
  it("accepts open third-party adapter-name literals", () => {
    // Any string literal should be accepted — not a closed union
    const registry = new AdapterRegistry([])
    expectTypeOf(registry.get).parameter(0).toEqualTypeOf<AdapterName>()
    expectTypeOf(registry.getOrThrow).parameter(0).toEqualTypeOf<AdapterName>()

    // Verify that arbitrary strings work (no closed union restriction)
    const _result = registry.get("my-custom-third-party-adapter")
    expectTypeOf(_result).toEqualTypeOf<AdapterFactory | undefined>()
  })

  it("exports are importable from package root", () => {
    expectTypeOf(AdapterRegistry).toBeConstructibleWith([])
    expectTypeOf(DuplicateAdapterError).toBeConstructibleWith("test")
    expectTypeOf(UnknownAdapterError).toBeConstructibleWith("test", [])
  })

  it("list() return type is readonly AdapterName[]", () => {
    const registry = new AdapterRegistry([])
    expectTypeOf(registry.list()).toEqualTypeOf<readonly AdapterName[]>()
  })

  it("get() returns AdapterFactory | undefined", () => {
    const registry = new AdapterRegistry([])
    expectTypeOf(registry.get("any")).toEqualTypeOf<
      AdapterFactory | undefined
    >()
  })

  it("getOrThrow() returns AdapterFactory", () => {
    const registry = new AdapterRegistry([])
    expectTypeOf(registry.getOrThrow("any")).toEqualTypeOf<AdapterFactory>()
  })
})
