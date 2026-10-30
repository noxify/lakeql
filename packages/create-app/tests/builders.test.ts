// oxlint-disable vitest/max-expects -- tests assert several facets of a single generated config

import {
  buildPlan,
  generateEnvExample,
  generateLakeqlConfig,
} from "@lakeql/scaffold"
import { describe, expect, it } from "vitest"

import { opsForAdapters, ADAPTERS } from "../src/features/adapters"

function adapter(id: string) {
  const found = ADAPTERS.find((a) => a.id === id)
  if (!found) {
    throw new Error(`test setup: unknown adapter ${id}`)
  }
  return found
}

describe(generateLakeqlConfig, () => {
  it("registers a single selected adapter with import + adapters array", () => {
    const plan = buildPlan(
      opsForAdapters([adapter("trino")], { trino: "warehouse" })
    )

    const out = generateLakeqlConfig(plan)

    expect(out).toContain(
      'import { trinoAdapterDefinition } from "@lakeql/adapter-trino"'
    )
    // Unquoted identifier inside the adapters array.
    expect(out).toContain("adapters: [trinoAdapterDefinition]")
    // Data source references the adapter id.
    expect(out).toContain("warehouse:")
    expect(out).toContain('adapter: "trino"')
    expect(out).toContain('import { defineConfig } from "@lakeql/config"')
    // Connection fields are nested under `connection`, matching the
    // DataSourceEntry shape (not flattened onto the data source).
    expect(out).toContain("connection: {")
    expect(out).toContain("host: env.TRINO_HOST")
    expect(out).toMatch(/connection: \{[\s\S]*host: env\.TRINO_HOST/u)
  })

  it("registers multiple adapters with one import and entry each", () => {
    const plan = buildPlan(
      opsForAdapters([adapter("trino"), adapter("fabric")], {
        trino: "warehouse",
        fabric: "analytics",
      })
    )

    const out = generateLakeqlConfig(plan)

    expect(out).toContain(
      'import { trinoAdapterDefinition } from "@lakeql/adapter-trino"'
    )
    expect(out).toContain(
      'import { fabricAdapterDefinition } from "@lakeql/adapter-fabric"'
    )
    // Both registered, exactly once each.
    expect(out).toContain(
      "adapters: [trinoAdapterDefinition, fabricAdapterDefinition]"
    )
    expect(out.match(/trinoAdapterDefinition/gu)?.length).toBe(2) // one import + one array entry
    expect(out.match(/fabricAdapterDefinition/gu)?.length).toBe(2)
  })

  it("de-duplicates a repeated adapter selection", () => {
    const plan = buildPlan(
      opsForAdapters([adapter("trino"), adapter("trino")], { trino: "wh" })
    )

    const out = generateLakeqlConfig(plan)

    expect(out.match(/import \{ trinoAdapterDefinition \}/gu)?.length).toBe(1)
    expect(out).toContain("adapters: [trinoAdapterDefinition]")
  })

  it("emits an empty adapters array and no adapter imports for an empty plan", () => {
    const plan = buildPlan([])

    const out = generateLakeqlConfig(plan)

    expect(out).toContain("adapters: []")
    expect(out).not.toContain("Adapter")
    expect(out).not.toMatch(/@lakeql\/adapter-/u)
  })
})

/** Builds a plan from grouped env-var ops (mirrors how features emit them). */
function envPlan(
  ...groups: { group?: string; vars: Record<string, string> }[]
) {
  return buildPlan(
    groups.map(({ group, vars }) => ({ type: "addEnvVars", group, vars }))
  )
}

const AUTH_GROUP = { group: "Authentication", vars: { AUTH_MOCK: "true" } }
const TRINO_GROUP = {
  group: "Trino data source",
  vars: { TRINO_HOST: '"http://localhost"', TRINO_PORT: "8080" },
}
const FABRIC_GROUP = {
  group: "Fabric data source",
  vars: { FABRIC_PORT: "1433" },
}

describe(generateEnvExample, () => {
  it("includes an intro comment with docs and repo links", () => {
    const out = generateEnvExample(envPlan(AUTH_GROUP))

    expect(out).toContain("Copy this file to .env")
    expect(out).toContain("https://lakeql.dev/docs")
    expect(out).toContain("https://github.com/noxify/lakeql")
  })

  it("renders a labelled section per group", () => {
    const out = generateEnvExample(
      envPlan(AUTH_GROUP, TRINO_GROUP, FABRIC_GROUP)
    )

    expect(out).toContain("# Authentication")
    expect(out).toContain("# Trino data source")
    expect(out).toContain("# Fabric data source")
    expect(out).toContain("# GraphQL API")
  })

  it("emits groups in insertion (selection) order, with the API section last", () => {
    // Trino selected before Fabric → Trino section comes first.
    const out = generateEnvExample(
      envPlan(AUTH_GROUP, TRINO_GROUP, FABRIC_GROUP)
    )

    const authIdx = out.indexOf("# Authentication")
    const trinoIdx = out.indexOf("# Trino data source")
    const fabricIdx = out.indexOf("# Fabric data source")
    const apiIdx = out.indexOf("# GraphQL API")

    expect(authIdx).toBeLessThan(trinoIdx)
    expect(trinoIdx).toBeLessThan(fabricIdx)
    expect(fabricIdx).toBeLessThan(apiIdx)
  })

  it("keeps vars under their group and sorted within it", () => {
    const out = generateEnvExample(envPlan(TRINO_GROUP))
    const lines = out.split("\n")
    const hostLine = lines.findIndex((l) => l.startsWith("TRINO_HOST="))
    const portLine = lines.findIndex((l) => l.startsWith("TRINO_PORT="))

    expect(hostLine).toBeGreaterThan(-1)
    expect(hostLine).toBeLessThan(portLine)
  })

  it("always includes the GraphQL API section even with no env vars", () => {
    const out = generateEnvExample(buildPlan([]))

    expect(out).toContain("# GraphQL API")
    expect(out).toContain("API_PORT=4000")
    expect(out).toContain('API_LOGGER="warn"')
  })
})
