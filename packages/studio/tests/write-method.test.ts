import type { EndpointDefinitionFormat } from "@lakeql/schema-generator/endpoint-schema"
import { describe, expect, it } from "vitest"

import {
  changeWriteMethod,
  commitSnapshot,
  createFreshHistory,
  currentState,
  evaluate,
  fromDefinition,
  migrateEditorState,
  planWriteMethodChange,
  toDefinition,
  undo,
} from "@/core"
import type { EditorState } from "@/core"

import { defined } from "./helpers"

const autoFill = {
  name: "load_timestamp",
  type: "DateTime",
  options: { autoFill: "write_timestamp" },
} as const

function storageState(
  overrides: Partial<EndpointDefinitionFormat> = {}
): EditorState {
  return fromDefinition({
    version: "2.0",
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields: [
      { name: "id", type: "String" },
      { name: "event", type: "DateTime" },
    ],
    mutation: {
      loadStrategy: "append",
      basePath: "/data",
      partitioning: false,
    },
    ...overrides,
  })
}

function enabledMutation(state: EditorState) {
  const { mutation } = state
  if (!mutation.enabled) {
    throw new Error("expected an enabled mutation")
  }
  return mutation
}

function withoutWriteMethod(partitioning: unknown): EditorState {
  const state = storageState()
  const { writeMethod: _drop, ...rest } = enabledMutation(state)
  return { ...state, mutation: { ...rest, partitioning } as never }
}

function reasonOf(state: EditorState) {
  return defined(evaluate(state).autoFillMutation[0]).reason
}

describe(planWriteMethodChange, () => {
  it("needs confirmation when a base path would be discarded", () => {
    const plan = planWriteMethodChange(storageState(), "insert")

    expect(plan.needsConfirmation).toBeTruthy()
    expect(plan.discardsBasePath).toBeTruthy()
    expect(plan.discardedBasePath).toBe("/data")
    expect(plan.discardsPartitioning).toBeFalsy()
    expect(plan.autoFillFields).toStrictEqual([])
  })

  it("needs no confirmation when nothing would be discarded", () => {
    const state = storageState({
      mutation: { loadStrategy: "append", basePath: "", partitioning: false },
    })

    expect(planWriteMethodChange(state, "insert").needsConfirmation).toBeFalsy()
  })

  it("lists partitioning, including an empty selection", () => {
    const withSegments = storageState({
      mutation: {
        loadStrategy: "append",
        basePath: "",
        partitioning: "event:year",
      },
    })
    const empty = {
      ...storageState(),
      mutation: {
        ...enabledMutation(storageState()),
        basePath: "",
        partitioning: [],
      },
    }

    const plan = planWriteMethodChange(withSegments, "insert")

    expect(plan.discardsPartitioning).toBeTruthy()
    expect(plan.discardedPartitioningLabel).toBe("event → year")
    expect(planWriteMethodChange(empty, "insert")).toMatchObject({
      discardsPartitioning: true,
      discardedPartitioningLabel: "an empty field selection",
    })
  })

  it("lists auto-fill fields", () => {
    const state = storageState({
      fields: [{ name: "id", type: "String" }, autoFill],
      mutation: { loadStrategy: "append", basePath: "", partitioning: false },
    })

    expect(planWriteMethodChange(state, "insert").autoFillFields).toStrictEqual(
      ["load_timestamp"]
    )
  })

  it("is a no-op for insert to storage, the same method and a disabled mutation", () => {
    const insert = changeWriteMethod(storageState(), "insert")

    expect(
      planWriteMethodChange(insert, "storage").needsConfirmation
    ).toBeFalsy()
    expect(
      planWriteMethodChange(storageState(), "storage").needsConfirmation
    ).toBeFalsy()
    expect(
      planWriteMethodChange(storageState({ mutation: false }), "insert")
        .needsConfirmation
    ).toBeFalsy()
  })
})

describe(changeWriteMethod, () => {
  it("clears basePath, partitioning and autoFill when switching to insert", () => {
    const state = storageState({
      fields: [{ name: "id", type: "String" }, autoFill],
      mutation: {
        loadStrategy: "append",
        basePath: "/data",
        partitioning: "id",
      },
    })

    const next = changeWriteMethod(state, "insert")

    expect(enabledMutation(next)).toMatchObject({
      writeMethod: "insert",
      basePath: "",
      partitioning: false,
    })
    expect(next.fields[1]).toMatchObject({
      name: "load_timestamp",
      type: "DateTime",
    })
    expect(next.fields[1]).not.toHaveProperty("options")
    expect(toDefinition(next).mutation).toStrictEqual({
      loadStrategy: "append",
      writeMethod: "insert",
    })
  })

  it("keeps other options when removing autoFill", () => {
    const state = storageState({
      fields: [
        {
          name: "load_timestamp",
          type: "DateTime",
          options: { autoFill: "write_timestamp", required: true },
        },
      ],
      mutation: { loadStrategy: "append", basePath: "/d", partitioning: false },
    })

    const next = changeWriteMethod(state, "insert")

    expect(next.fields[0]?.options).toStrictEqual({ required: true })
  })

  it("leaves the base path empty when switching back to storage", () => {
    const back = changeWriteMethod(
      changeWriteMethod(storageState(), "insert"),
      "storage"
    )

    expect(enabledMutation(back)).toMatchObject({
      writeMethod: "storage",
      basePath: "",
    })
  })

  it("returns the same state for a no-op", () => {
    const state = storageState()

    expect(changeWriteMethod(state, "storage")).toBe(state)
    expect(
      changeWriteMethod(storageState({ mutation: false }), "insert")
    ).toMatchObject({
      mutation: { enabled: false },
    })
  })

  it("restores the pre-switch state with a single undo", () => {
    const before = storageState()
    const history = commitSnapshot(
      { snapshots: [before], cursor: 0 },
      changeWriteMethod(before, "insert")
    )

    expect(currentState(undo(history))).toBe(before)
    expect(createFreshHistory().cursor).toBe(0)
  })
})

describe(migrateEditorState, () => {
  it.each([
    ["array partitioning", []],
    ["legacy string partitioning", "id"],
    ["unknown partitioning", 42],
    ["partitioning off", false],
  ])("defaults an old draft with %s to storage", (_name, partitioning) => {
    const migrated = migrateEditorState(withoutWriteMethod(partitioning))

    expect(enabledMutation(migrated).writeMethod).toBe("storage")
  })

  it("keeps an existing insert method and returns an unchanged state as is", () => {
    const insert = changeWriteMethod(storageState(), "insert")
    const storage = storageState()

    expect(enabledMutation(migrateEditorState(insert)).writeMethod).toBe(
      "insert"
    )
    expect(migrateEditorState(storage)).toBe(storage)
  })
})

describe("auto-fill diagnostic reason", () => {
  const fields = [{ name: "id", type: "String" }, autoFill] as const

  it("reports mutation-disabled, load-strategy and insert", () => {
    const disabled = storageState({ fields: [...fields], mutation: false })
    const fullLoad = storageState({
      fields: [...fields],
      mutation: { loadStrategy: "full_load", basePath: "/d" },
    })
    const insert = storageState({
      fields: [...fields],
      mutation: { loadStrategy: "append", writeMethod: "insert" },
    })

    expect(reasonOf(disabled)).toBe("mutation-disabled")
    expect(reasonOf(fullLoad)).toBe("load-strategy")
    expect(reasonOf(insert)).toBe("insert")
  })

  it("lets the load-strategy reason win over insert", () => {
    const state = storageState({
      fields: [...fields],
      mutation: { loadStrategy: "full_load", writeMethod: "insert" },
    })

    expect(reasonOf(state)).toBe("load-strategy")
  })
})
