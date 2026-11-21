// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { CanvasSurface } from "@/components/studio/canvas/canvas"
import { CanvasShellRoot } from "@/components/studio/canvas/shell-root"
import { EndpointBuilder } from "@/components/studio/endpoint-builder"
import { MutationConfigForm } from "@/components/studio/mutation-config-form"
import type { EditorApi } from "@/components/studio/use-editor"
import { EditorProvider, useEditor } from "@/components/studio/use-editor"
import type { EditorPartitionSegment, EditorState } from "@/core"
import { createFreshState, serializePartitionSegments } from "@/core"

import { defined } from "./helpers"

/** An enabled mutation seeded in off (flat) partitioning mode. */
function enabledState(fields: EditorState["fields"] = []): EditorState {
  return {
    ...createFreshState(),
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields,
    mutation: {
      enabled: true,
      loadStrategy: "append",
      basePath: "/d",
      partitioning: false,
    },
  }
}

/**
 * Renders a UI subtree under a live `EditorProvider`, capturing the editor API
 * so a test can seed state via `replaceState` and drive the controls.
 */
function renderWithEditor(ui: (editor: EditorApi) => ReactNode): {
  get: () => EditorApi
} {
  const bag: { editor: EditorApi | null } = { editor: null }
  const Wrapper = (): ReactNode => {
    const editor = useEditor()
    useEffect(() => {
      bag.editor = editor
    })
    return <EditorProvider value={editor}>{ui(editor)}</EditorProvider>
  }
  render(<Wrapper />)
  return { get: () => defined(bag.editor) }
}

/** Seeds the editor to a given state (committed). */
function seed(editor: EditorApi, state: EditorState): void {
  act(() => {
    editor.replaceState(state, { commit: true })
  })
}

/** Reads the current `partitioning` value, asserting the mutation is enabled. */
function partitioningOf(editor: EditorApi): false | EditorPartitionSegment[] {
  const { mutation } = editor.state
  expect(mutation.enabled).toBeTruthy()
  if (!mutation.enabled) {
    throw new Error("mutation is not enabled")
  }
  return mutation.partitioning
}

/** Reads the partitioning serialized to its exported name-based string. */
function partitionStringOf(editor: EditorApi): false | string {
  const partitioning = partitioningOf(editor)
  return partitioning === false
    ? false
    : serializePartitionSegments(partitioning, editor.state.fields)
}

/** Renders the canvas surface under a shell root with a seedable editor. */
function renderCanvas(): { get: () => EditorApi } {
  return renderWithEditor(() => (
    <CanvasShellRoot>
      <CanvasSurface />
    </CanvasShellRoot>
  ))
}

describe("PartitioningControls mode picker", () => {
  afterEach(cleanup)

  it("renders two rich radio choices with titles and descriptions", () => {
    const harness = renderWithEditor(() => <MutationConfigForm />)
    // Seed an enabled mutation so the partitioning picker renders.
    seed(harness.get(), enabledState())

    const group = screen.getByRole("radiogroup", {
      name: "Partitioning mode",
    })
    const scope = within(group)
    expect(scope.getByText("Off (flat layout)")).toBeDefined()
    expect(scope.getByText("By field / custom format")).toBeDefined()
    // The removed write-timestamp mode is gone from the picker.
    expect(scope.queryByText("By write timestamp")).toBeNull()
  })

  it("starts a freshly-enabled mutation in off mode (partitioning === false)", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    await user.click(screen.getByRole("switch", { name: "Enable mutation" }))
    expect(partitioningOf(harness.get())).toBeFalsy()
  })
})

/** Seeds an empty by-field selection over the given fields and renders the form. */
function renderPicker(fields: EditorState["fields"]): { get: () => EditorApi } {
  const harness = renderWithEditor(() => <MutationConfigForm />)
  seed(harness.get(), withPartitioning([], fields))
  return harness
}

/** The picker's trigger button. */
const trigger = (): HTMLElement => screen.getByLabelText("Add partition field")

/** The labels of the currently rendered picker options. */
const optionLabels = (): (string | null)[] =>
  screen.getAllByRole("option").map((option) => option.textContent)

describe("PartitioningFieldPicker popover", () => {
  afterEach(cleanup)

  it("lists fields on the root page and drills into a date field", async () => {
    const user = userEvent.setup()
    renderPicker([
      { id: "f1", name: "region", type: "String" },
      { id: "f2", name: "created_at", type: "DateTime" },
    ])

    await user.click(trigger())
    expect(optionLabels()).toStrictEqual(["region", "created_at"])

    await user.click(screen.getByRole("option", { name: "created_at" }))
    expect(optionLabels()).toStrictEqual([
      "year / month / day",
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
    ])
  })

  it("appends a bare segment for a non-date field and closes", async () => {
    const user = userEvent.setup()
    const harness = renderPicker([{ id: "f1", name: "region", type: "String" }])

    await user.click(trigger())
    await user.click(screen.getByRole("option", { name: "region" }))

    expect(partitioningOf(harness.get())).toStrictEqual([{ fieldId: "f1" }])
    expect(partitionStringOf(harness.get())).toBe("region")
    expect(screen.queryByRole("option")).toBeNull()
    // The chosen field is hidden on reopen.
    await user.click(trigger())
    expect(screen.queryByRole("option", { name: "region" })).toBeNull()
  })

  it("appends one component and hides it afterwards", async () => {
    const user = userEvent.setup()
    const harness = renderPicker([
      { id: "f1", name: "created_at", type: "DateTime" },
    ])

    await user.click(trigger())
    await user.click(screen.getByRole("option", { name: "created_at" }))
    await user.click(screen.getByRole("option", { name: "year" }))

    expect(partitionStringOf(harness.get())).toBe("created_at:year")
    expect(
      screen.getByRole("button", { name: "Remove created_at → year" })
    ).toBeDefined()

    await user.click(trigger())
    await user.click(screen.getByRole("option", { name: "created_at" }))
    const labels = optionLabels()
    expect(labels).not.toContain("year")
    expect(labels).toContain("month")
    // Any chosen part removes the combined option.
    expect(labels).not.toContain("year / month / day")
  })

  it("appends year, month and day in one history snapshot", async () => {
    const user = userEvent.setup()
    const harness = renderPicker([
      { id: "f1", name: "created_at", type: "DateTime" },
    ])

    await user.click(trigger())
    await user.click(screen.getByRole("option", { name: "created_at" }))
    await user.click(screen.getByRole("option", { name: "year / month / day" }))

    expect(partitionStringOf(harness.get())).toBe(
      "created_at:year/created_at:month/created_at:day"
    )
    act(() => harness.get().undo())
    expect(partitioningOf(harness.get())).toStrictEqual([])
  })

  it("searches across fields and components", async () => {
    const user = userEvent.setup()
    const harness = renderPicker([
      { id: "f1", name: "region", type: "String" },
      { id: "f2", name: "event", type: "DateTime" },
    ])

    await user.click(trigger())
    await user.type(screen.getByPlaceholderText(/Search fields/u), "event year")
    expect(optionLabels()).toContain("event → year")
    expect(optionLabels()).not.toContain("region")

    await user.click(screen.getByRole("option", { name: "event → year" }))
    expect(partitionStringOf(harness.get())).toBe("event:year")
  })

  it("returns from a sub-page with Escape and with Backspace on an empty search", async () => {
    const user = userEvent.setup()
    renderPicker([
      { id: "f1", name: "region", type: "String" },
      { id: "f2", name: "event", type: "DateTime" },
    ])

    await user.click(trigger())
    await user.click(screen.getByRole("option", { name: "event" }))
    expect(optionLabels()).toContain("year / month / day")
    await user.keyboard("{Escape}")
    expect(optionLabels()).toStrictEqual(["region", "event"])

    await user.click(screen.getByRole("option", { name: "event" }))
    await user.keyboard("{Backspace}")
    expect(optionLabels()).toStrictEqual(["region", "event"])

    // On the root page Escape closes the popover.
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("option")).toBeNull()
  })

  it("explains an empty candidate list", async () => {
    const user = userEvent.setup()
    renderPicker([])
    await user.click(trigger())
    expect(screen.getByText(/No partitionable fields/u)).toBeDefined()
  })

  it("removing a badge drops the segment", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(
      harness.get(),
      withPartitioning(
        [{ fieldId: "f1" }],
        [{ id: "f1", name: "region", type: "String" }]
      )
    )

    await user.click(screen.getByRole("button", { name: "Remove region" }))
    expect(partitioningOf(harness.get())).toStrictEqual([])
  })
})

describe("write-timestamp auto-fill helper", () => {
  afterEach(cleanup)

  it("adds a real top-level DateTime auto-fill field named load_timestamp", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(harness.get(), enabledState())

    await user.click(
      screen.getByRole("button", { name: "Add write-timestamp field" })
    )

    const { fields } = harness.get().state
    expect(fields).toHaveLength(1)
    const added = defined(fields[0])
    expect(added.name).toBe("load_timestamp")
    expect(added.type).toBe("DateTime")
    expect(added.options?.autoFill).toBe("write_timestamp")
    // It is a persisted, id-carrying field (not a phantom view-model row).
    expect(added.id.length).toBeGreaterThan(0)
  })

  it("disables the helper when a field already owns the default name", () => {
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(
      harness.get(),
      enabledState([{ id: "f1", name: "load_timestamp", type: "DateTime" }])
    )
    const button = screen.getByRole("button", {
      name: "Add write-timestamp field",
    })
    expect(button).toHaveProperty("disabled", true)
    // A plain user field owns the name: the hint explains the collision.
    expect(
      screen.getByText(/A field named load_timestamp already exists/u)
    ).toBeDefined()
  })

  it("after adding, shows a neutral hint instead of a collision message", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(harness.get(), enabledState())

    await user.click(
      screen.getByRole("button", { name: "Add write-timestamp field" })
    )

    expect(
      screen.getByRole("button", { name: "Add write-timestamp field" })
    ).toHaveProperty("disabled", true)
    expect(
      screen.getByText(/load_timestamp is part of this endpoint/u)
    ).toBeDefined()
    expect(screen.queryByText(/already exists/u)).toBeNull()
  })
})

/** An enabled mutation with the given partitioning value. */
function withPartitioning(
  partitioning: false | EditorPartitionSegment[],
  fields: EditorState["fields"] = []
): EditorState {
  const state = enabledState(fields)
  return state.mutation.enabled
    ? { ...state, mutation: { ...state.mutation, partitioning } }
    : state
}

/** Clicks the write-timestamp helper button. */
async function clickHelper(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  await user.click(
    screen.getByRole("button", { name: "Add write-timestamp field" })
  )
}

describe("write-timestamp auto-fill helper partition prefill", () => {
  afterEach(cleanup)

  it("prefills an empty by-field selection, undone together with the field", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(harness.get(), withPartitioning([]))

    await clickHelper(user)

    expect(partitionStringOf(harness.get())).toBe(
      "load_timestamp:year/load_timestamp:month/load_timestamp:day"
    )
    expect(harness.get().state.fields).toHaveLength(1)

    // One snapshot: a single undo reverts both the field and the prefill.
    act(() => harness.get().undo())
    expect(harness.get().state.fields).toHaveLength(0)
    expect(partitioningOf(harness.get())).toStrictEqual([])
  })

  it("leaves an already chosen partition path untouched", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(
      harness.get(),
      withPartitioning(
        [{ fieldId: "f1" }],
        [{ id: "f1", name: "region", type: "String" }]
      )
    )

    await clickHelper(user)

    expect(partitionStringOf(harness.get())).toBe("region")
    expect(harness.get().state.fields).toHaveLength(2)
  })

  it("does not switch an off partitioning to by-field", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(harness.get(), withPartitioning(false))

    await clickHelper(user)

    // Still the boolean `false` (off), not switched to an empty by-field "".
    const partitioning = partitioningOf(harness.get())
    expect(partitioning).toBeTypeOf("boolean")
    expect(partitioning).toBeFalsy()
    expect(harness.get().state.fields).toHaveLength(1)
  })
})

describe("write-timestamp auto-fill helper in the shell", () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it("confirms with a success toast whose action opens the new field", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // The shell lands on General Settings, which hosts the mutation form.
    await user.click(screen.getByRole("switch", { name: "Enable mutation" }))
    await user.click(
      screen.getByRole("button", { name: "Add write-timestamp field" })
    )

    await expect(
      screen.findByText("Write-timestamp field added")
    ).resolves.toBeDefined()

    await user.click(screen.getByRole("button", { name: "Show field" }))

    // The Fields view opens with the new field selected in the panel.
    expect(screen.getByRole("heading", { name: "Fields" })).toBeDefined()
    const panel = screen.getByRole("complementary", {
      name: "Field properties",
    })
    expect(
      within(panel).getByRole("heading", { name: "load_timestamp" })
    ).toBeDefined()
  })
})

describe("CanvasSurface has no phantom derived row", () => {
  afterEach(cleanup)

  it("never renders a managed load_timestamp row for any partitioning value", () => {
    const harness = renderCanvas()
    seed(harness.get(), enabledState())
    expect(
      screen.queryByRole("group", {
        name: "load_timestamp (managed, read-only)",
      })
    ).toBeNull()
  })
})
