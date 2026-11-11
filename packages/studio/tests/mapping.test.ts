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

  // `timestampMode` marks a case whose mutation resolves to timestamp mode
  // (partitioning `true`, explicit or defaulted). Such a case is NOT a pure
  // round-trip: `toDefinition` materializes the derived `load_timestamp` field
  // on export, so the re-export carries one extra field the input lacked.
  it.each<{
    name: string
    mutation: EndpointDefinitionFormat["mutation"]
    timestampMode?: boolean
  }>([
    { name: "disabled", mutation: false },
    {
      name: "timestamp default (minimal)",
      mutation: { loadStrategy: "append", basePath: "/data" },
      timestampMode: true,
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
      timestampMode: true,
    },
    {
      name: "partitioning year/month",
      mutation: {
        loadStrategy: "append",
        basePath: "/d",
        partitioningFormat: "year/month",
      },
      timestampMode: true,
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
  ])("round-trips mutation mode: $name", ({ mutation, timestampMode }) => {
    const def = withMutation(mutation)
    const round = toDefinition(fromDefinition(def))
    // In timestamp mode the derived `load_timestamp` field is materialized on
    // export (the intended derived-field behavior), so the re-export equals the
    // input plus that one appended field. Every other mode round-trips exactly.
    const expected = timestampMode
      ? {
          ...def,
          fields: [...def.fields, { name: "load_timestamp", type: "DateTime" }],
        }
      : def
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

/** An enabled mutation with the given partitioning value. */
function enabledMutation(
  partitioning: boolean | string
): EndpointDefinitionFormat["mutation"] {
  return { loadStrategy: "append", basePath: "/d", partitioning }
}

describe("derived load_timestamp injection (timestamp mode)", () => {
  it("appends a bare load_timestamp DateTime field in timestamp mode", () => {
    const def = toDefinition(
      fromDefinition(withMutation(enabledMutation(true)))
    )
    const timestampField = defined(
      def.fields.find((field) => field.name === "load_timestamp")
    )
    expect(timestampField).toStrictEqual({
      name: "load_timestamp",
      type: "DateTime",
    })
    expect(timestampField).not.toHaveProperty("options")
    expect(timestampField).not.toHaveProperty("readOnly")
  })

  it("does not inject in off, field, or disabled modes", () => {
    const off = toDefinition(
      fromDefinition(withMutation(enabledMutation(false)))
    )
    const fieldMode = toDefinition(
      fromDefinition(withMutation(enabledMutation("created_at")))
    )
    const disabled = toDefinition(fromDefinition(withMutation(false)))
    for (const def of [off, fieldMode, disabled]) {
      expect(
        def.fields.some((field) => field.name === "load_timestamp")
      ).toBeFalsy()
    }
  })

  it("does not duplicate load_timestamp across export → import → export", () => {
    const exported = toDefinition(
      fromDefinition(withMutation(enabledMutation(true)))
    )
    const reExported = toDefinition(fromDefinition(exported))
    const count = reExported.fields.filter(
      (field) => field.name === "load_timestamp"
    ).length
    expect(count).toBe(1)
  })

  it("materializes load_timestamp on a minimal timestamp-default definition and never duplicates it", () => {
    // Documents the Option-A decision: a hand-written definition that OMITS
    // partitioning resolves to timestamp mode, so the next export gains a
    // derived load_timestamp field. Re-importing that export and re-exporting
    // keeps exactly one (the dedup guard holds).
    const minimal = withMutation({ loadStrategy: "append", basePath: "/d" })
    const exported = toDefinition(fromDefinition(minimal))
    expect(
      exported.fields.filter((field) => field.name === "load_timestamp")
    ).toHaveLength(1)
    const reExported = toDefinition(fromDefinition(exported))
    expect(
      reExported.fields.filter((field) => field.name === "load_timestamp")
    ).toHaveLength(1)
  })

  it("materializes an imported load_timestamp as an ordinary editable field", () => {
    const state = fromDefinition({
      ...withMutation(enabledMutation(true)),
      fields: [
        { name: "id", type: "String" },
        { name: "load_timestamp", type: "DateTime" },
      ],
    })
    const materialized = defined(
      state.fields.find((field) => field.name === "load_timestamp")
    )
    // An ordinary field: it has a client-side id like every imported field.
    expect(materialized.id.length).toBeGreaterThan(0)
    expect(materialized.type).toBe("DateTime")
  })

  it("exports exactly one load_timestamp when a user field already owns the name", () => {
    const state = fromDefinition({
      ...withMutation(enabledMutation(true)),
      fields: [
        { name: "id", type: "String" },
        { name: "load_timestamp", type: "DateTime" },
      ],
    })
    const def = toDefinition(state)
    const count = def.fields.filter(
      (field) => field.name === "load_timestamp"
    ).length
    expect(count).toBe(1)
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
