import type { EndpointDefinitionFormat } from "@lakeql/schema-generator/endpoint-schema"
import { endpointDefinitionSchema } from "@lakeql/schema-generator/endpoint-schema"
import { describe, expect, it } from "vitest"

import { fromDefinition, toDefinition } from "@/core/mapping"
import type { EditorField } from "@/core/model"
import { createFreshState } from "@/core/model"

import { defined } from "./helpers"

/**
 * A definition exercising nested `Object`, `Array`-of-`Object`, every
 * validation kind, and non-default options.
 */
const nestedDefinition: EndpointDefinitionFormat = {
  version: "2.0",
  tableName: "events",
  catalog: "main",
  schema: "public",
  dataSource: "warehouse",
  fields: [
    {
      name: "email",
      type: "String",
      options: {
        required: true,
        validations: [{ type: "email" }, { type: "regex", pattern: "^.+@.+$" }],
      },
    },
    {
      name: "age",
      type: "Integer",
      options: {
        validations: [
          { type: "min", value: 0 },
          { type: "max", value: 120 },
        ],
      },
    },
    {
      name: "homepage",
      type: "String",
      options: { validations: [{ type: "url" }] },
    },
    {
      name: "token",
      type: "String",
      options: { validations: [{ type: "uuid" }] },
    },
    { name: "active", type: "Boolean", options: { readOnly: true } },
    {
      name: "profile",
      type: "Object",
      fields: [
        { name: "nickname", type: "String" },
        {
          name: "address",
          type: "Object",
          fields: [{ name: "city", type: "String" }],
        },
      ],
    },
    {
      name: "tags",
      type: "Array",
      items: { type: "String" },
    },
    {
      name: "items",
      type: "Array",
      items: {
        type: "Object",
        fields: [
          { name: "sku", type: "String", options: { required: true } },
          { name: "qty", type: "Integer" },
        ],
      },
    },
  ],
  mutation: false,
}

/** Builds a base definition with a given mutation value. */
function withMutation(
  mutation: EndpointDefinitionFormat["mutation"]
): EndpointDefinitionFormat {
  return {
    version: "2.0",
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields: [{ name: "id", type: "String" }],
    mutation,
  }
}

describe("round-trip stability", () => {
  it("toDefinition(fromDefinition(def)) equals def for a nested definition", () => {
    const round = toDefinition(fromDefinition(nestedDefinition))
    expect(round).toStrictEqual(nestedDefinition)
    // And it is schema-valid.
    expect(endpointDefinitionSchema.safeParse(round).success).toBeTruthy()
  })

  // An enabled mutation always exports an explicit `partitioning` value (C8):
  // an absent key resolves to `false` (off), so a minimal enabled mutation is
  // NOT a pure round-trip — the re-export gains `partitioning: false`. Cases
  // that already carry an explicit `partitioning` round-trip exactly.
  it.each<{
    name: string
    mutation: EndpointDefinitionFormat["mutation"]
    gainsExplicitOff?: boolean
  }>([
    { name: "disabled", mutation: false },
    {
      name: "minimal enabled (absent partitioning ⇒ off)",
      mutation: { loadStrategy: "append", basePath: "/data" },
      gainsExplicitOff: true,
    },
    {
      name: "partitioning off",
      mutation: {
        loadStrategy: "full_load",
        basePath: "/d",
        partitioning: false,
      },
    },
    {
      name: "custom field partitioning",
      mutation: {
        loadStrategy: "append",
        basePath: "/d",
        partitioning: "created_at:year/region",
      },
    },
  ])("round-trips mutation mode: $name", ({ mutation, gainsExplicitOff }) => {
    const def = withMutation(mutation)
    const round = toDefinition(fromDefinition(def))
    // An enabled mutation always gains an explicit `writeMethod` (absent ⇒
    // "storage"), and a minimal one an explicit `partitioning: false` (C8);
    // every other case round-trips exactly.
    const expected =
      mutation === false
        ? def
        : {
            ...def,
            mutation: {
              ...mutation,
              writeMethod: "storage",
              ...(gainsExplicitOff ? { partitioning: false } : {}),
            },
          }
    expect(round).toStrictEqual(expected)
    expect(endpointDefinitionSchema.safeParse(round).success).toBeTruthy()
  })
})

describe("minimal JSON", () => {
  it("omits empty dataSource", () => {
    const def = toDefinition({
      ...createFreshState(),
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [],
    })
    expect(def).not.toHaveProperty("dataSource")
  })

  it("omits options entirely when a field has no required/readOnly/validations", () => {
    const def = toDefinition(fromDefinition(withMutation(false)))
    expect(defined(def.fields[0])).not.toHaveProperty("options")
  })

  it("emits mutation literal false when disabled", () => {
    const def = toDefinition(fromDefinition(withMutation(false)))
    expect(def).toHaveProperty("mutation", false)
  })

  it("always emits an explicit partitioning for an enabled mutation (absent ⇒ false)", () => {
    const def = toDefinition(
      fromDefinition(withMutation({ loadStrategy: "append", basePath: "/d" }))
    )
    expect(def.mutation).toStrictEqual({
      loadStrategy: "append",
      writeMethod: "storage",
      basePath: "/d",
      partitioning: false,
    })
  })

  it("keeps an explicit false when partitioning is off", () => {
    const def = toDefinition(
      fromDefinition(
        withMutation({
          loadStrategy: "append",
          basePath: "/d",
          partitioning: false,
        })
      )
    )
    expect(def.mutation).toStrictEqual({
      loadStrategy: "append",
      writeMethod: "storage",
      basePath: "/d",
      partitioning: false,
    })
  })

  it("keeps a custom partitioning string", () => {
    const def = toDefinition(
      fromDefinition(
        withMutation({
          loadStrategy: "append",
          basePath: "/d",
          partitioning: "a/b",
        })
      )
    )
    expect(def.mutation).toStrictEqual({
      loadStrategy: "append",
      writeMethod: "storage",
      basePath: "/d",
      partitioning: "a/b",
    })
  })

  it("drops required:false and readOnly:false, keeping only set options", () => {
    const state = fromDefinition({
      ...withMutation(false),
      fields: [
        {
          name: "x",
          type: "String",
          options: { required: false, readOnly: false, validations: [] },
        },
      ],
    })
    const def = toDefinition(state)
    expect(defined(def.fields[0])).not.toHaveProperty("options")
  })
})

describe("no field is injected on export (auto-fill is explicit)", () => {
  it("never injects a load_timestamp field for any partitioning value", () => {
    const off = toDefinition(
      fromDefinition(withMutation({ loadStrategy: "append", basePath: "/d" }))
    )
    const fieldMode = toDefinition(
      fromDefinition(
        withMutation({
          loadStrategy: "append",
          basePath: "/d",
          partitioning: "created_at",
        })
      )
    )
    const disabled = toDefinition(fromDefinition(withMutation(false)))
    for (const def of [off, fieldMode, disabled]) {
      expect(
        def.fields.some((field) => field.name === "load_timestamp")
      ).toBeFalsy()
    }
  })

  it("preserves an explicit auto-fill field verbatim on export (no companions injected)", () => {
    // A declared auto-fill field is an ordinary persisted field; its derived
    // companions live in codegen, never in the exported fields (Option Y).
    const def = toDefinition(
      fromDefinition({
        version: "2.0",
        tableName: "t",
        catalog: "c",
        schema: "s",
        fields: [
          { name: "id", type: "String" },
          {
            name: "load_timestamp",
            type: "DateTime",
            options: { autoFill: "write_timestamp" },
          },
        ],
        mutation: {
          loadStrategy: "append",
          basePath: "/d",
          partitioning: false,
        },
      })
    )
    expect(def.fields).toStrictEqual([
      { name: "id", type: "String" },
      {
        name: "load_timestamp",
        type: "DateTime",
        options: { autoFill: "write_timestamp" },
      },
    ])
    expect(endpointDefinitionSchema.safeParse(def).success).toBeTruthy()
  })
})

describe("fromDefinition materializes effective defaults", () => {
  it("resolves an absent partitioning to off (false)", () => {
    const state = fromDefinition(
      withMutation({ loadStrategy: "append", basePath: "/d" })
    )
    expect(state.mutation).toMatchObject({
      enabled: true,
      partitioning: false,
    })
  })

  it("assigns a client-side id to every field, nested too", () => {
    const state = fromDefinition(nestedDefinition)
    const ids: string[] = []
    const collect = (fields: EditorField[]): void => {
      for (const field of fields) {
        ids.push(field.id)
        if (field.fields) {
          collect(field.fields)
        }
        if (field.items?.type === "Object" && field.items.fields) {
          collect(field.items.fields)
        }
      }
    }
    collect(state.fields)
    expect(ids.every((id) => id.length > 0)).toBeTruthy()
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("write method mapping", () => {
  it("imports an absent writeMethod as storage", () => {
    const state = fromDefinition(
      withMutation({ loadStrategy: "append", basePath: "/d" })
    )
    expect(state.mutation).toMatchObject({
      enabled: true,
      writeMethod: "storage",
      basePath: "/d",
    })
  })

  it("round-trips insert and omits basePath and partitioning", () => {
    const def = withMutation({
      loadStrategy: "append",
      writeMethod: "insert",
      partitioning: false,
    })
    const state = fromDefinition(def)
    const round = toDefinition(state)

    expect(state.mutation).toMatchObject({
      enabled: true,
      writeMethod: "insert",
      basePath: "",
      partitioning: false,
    })
    expect(round.mutation).toStrictEqual({
      loadStrategy: "append",
      writeMethod: "insert",
    })
    expect(endpointDefinitionSchema.safeParse(round).success).toBeTruthy()
  })
})
