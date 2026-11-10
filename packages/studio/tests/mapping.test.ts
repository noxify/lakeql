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
  version: "1.0",
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
    version: "1.0",
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

  it.each<{ name: string; mutation: EndpointDefinitionFormat["mutation"] }>([
    { name: "disabled", mutation: false },
    {
      name: "timestamp default (minimal)",
      mutation: { loadStrategy: "append", basePath: "/data" },
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
      name: "partitioning year",
      mutation: {
        loadStrategy: "full_load_append",
        basePath: "/d",
        partitioningFormat: "year",
      },
    },
    {
      name: "partitioning year/month",
      mutation: {
        loadStrategy: "append",
        basePath: "/d",
        partitioningFormat: "year/month",
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
    {
      name: "legacy single-field partitioning with format",
      mutation: {
        loadStrategy: "append",
        basePath: "/d",
        partitioning: "created_at",
        partitioningFormat: "year/month",
      },
    },
  ])("round-trips mutation mode: $name", ({ mutation }) => {
    const def = withMutation(mutation)
    const round = toDefinition(fromDefinition(def))
    expect(round).toStrictEqual(def)
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

  it("omits partitioning when it equals the effective default (true)", () => {
    const def = toDefinition(
      fromDefinition(withMutation({ loadStrategy: "append", basePath: "/d" }))
    )
    expect(def.mutation).toStrictEqual({
      loadStrategy: "append",
      basePath: "/d",
    })
  })

  it("omits partitioningFormat when it equals the effective default", () => {
    const def = toDefinition(
      fromDefinition(
        withMutation({
          loadStrategy: "append",
          basePath: "/d",
          partitioningFormat: "year/month/day",
        })
      )
    )
    expect(def.mutation).toStrictEqual({
      loadStrategy: "append",
      basePath: "/d",
    })
  })

  it("omits partitioningFormat when partitioning is off", () => {
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
      basePath: "/d",
      partitioning: false,
    })
  })

  it("omits partitioningFormat when partitioning is a custom string", () => {
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

describe("fromDefinition materializes effective defaults", () => {
  it("fills partitioning/partitioningFormat on an enabled minimal mutation", () => {
    const state = fromDefinition(
      withMutation({ loadStrategy: "append", basePath: "/d" })
    )
    expect(state.mutation).toMatchObject({
      enabled: true,
      partitioning: true,
      partitioningFormat: "year/month/day",
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
