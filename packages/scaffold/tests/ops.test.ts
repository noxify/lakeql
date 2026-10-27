import { describe, expect, it } from "vitest"

import type { Op } from "../src/ops"
import { buildPlan } from "../src/ops"
import { expr } from "../src/ts-serializer"

function addDataSource(overrides: Partial<Op> = {}): Op {
  return {
    type: "addDataSource",
    name: "trino",
    adapter: "trino",
    config: {},
    ...overrides,
  } as Op
}

describe("applyOp addDataSource", () => {
  it("deep-merges config of two ops with the same name (default merge)", () => {
    const plan = buildPlan([
      addDataSource({
        config: { host: expr("env.TRINO_HOST"), options: { ssl: true } },
      }),
      addDataSource({
        config: { catalog: "hive", options: { timeout: 30 } },
      }),
    ])

    expect(plan.dataSources.trino).toStrictEqual({
      adapter: "trino",
      config: {
        host: expr("env.TRINO_HOST"),
        catalog: "hive",
        options: { ssl: true, timeout: 30 },
      },
    })
  })

  it("replace merge discards the previous config", () => {
    const plan = buildPlan([
      addDataSource({ config: { host: "a", catalog: "hive" } }),
      addDataSource({ merge: "replace", config: { host: "b" } }),
    ])

    expect(plan.dataSources.trino?.config).toStrictEqual({ host: "b" })
  })

  it("throws when the same data source name switches adapters", () => {
    expect(() =>
      buildPlan([
        addDataSource({ name: "src", adapter: "trino" }),
        addDataSource({ name: "src", adapter: "fabric" }),
      ])
    ).toThrow(/cannot change/u)
  })
})
