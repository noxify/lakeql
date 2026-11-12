// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { CanvasSurface } from "@/components/studio/canvas/canvas"
import { CanvasShellRoot } from "@/components/studio/canvas/shell-root"
import { MutationConfigForm } from "@/components/studio/mutation-config-form"
import type { EditorApi } from "@/components/studio/use-editor"
import { EditorProvider, useEditor } from "@/components/studio/use-editor"
import type { EditorState } from "@/core"
import { createFreshState } from "@/core"

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
      partitioningFormat: "year/month/day",
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
function partitioningOf(editor: EditorApi): false | string {
  const { mutation } = editor.state
  expect(mutation.enabled).toBeTruthy()
  if (!mutation.enabled) {
    throw new Error("mutation is not enabled")
  }
  return mutation.partitioning
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

describe("PartitioningFieldPicker combobox", () => {
  afterEach(cleanup)

  it("resolves a String field to one option and a DateTime field to six", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(harness.get(), {
      ...enabledState([
        { id: "f1", name: "region", type: "String" },
        { id: "f2", name: "created_at", type: "DateTime" },
      ]),
      mutation: {
        enabled: true,
        loadStrategy: "append",
        basePath: "/d",
        partitioning: "",
        partitioningFormat: "year/month/day",
      },
    })

    const input = screen.getByLabelText("Add partition field")
    await user.click(input)

    // One option for the String field.
    expect(screen.getAllByText("region")).toHaveLength(1)
    // Six component options for the DateTime field.
    for (const component of [
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
    ]) {
      expect(screen.getByText(`created_at → ${component}`)).toBeDefined()
    }
  })

  it("appends a chosen segment as a badge and hides that exact option", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(harness.get(), {
      ...enabledState([{ id: "f1", name: "created_at", type: "DateTime" }]),
      mutation: {
        enabled: true,
        loadStrategy: "append",
        basePath: "/d",
        partitioning: "",
        partitioningFormat: "year/month/day",
      },
    })

    const input = screen.getByLabelText("Add partition field")
    await user.click(input)
    await user.click(screen.getByText("created_at → year"))

    // The partitioning string now holds the chosen segment.
    expect(partitioningOf(harness.get())).toBe("created_at:year")
    // A removable badge appears for it.
    expect(
      screen.getByRole("button", { name: "Remove created_at → year" })
    ).toBeDefined()

    // Re-open: the chosen year option is gone from the list, but month stays
    // available. Query options by role so the badge (a sortable button with the
    // same text) does not match.
    await user.click(input)
    const optionLabels = screen
      .getAllByRole("option")
      .map((option) => option.textContent)
    expect(optionLabels).not.toContain("created_at → year")
    expect(optionLabels).toContain("created_at → month")
  })

  it("removing a badge drops the segment", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(harness.get(), {
      ...enabledState([{ id: "f1", name: "region", type: "String" }]),
      mutation: {
        enabled: true,
        loadStrategy: "append",
        basePath: "/d",
        partitioning: "region",
        partitioningFormat: "year/month/day",
      },
    })

    await user.click(screen.getByRole("button", { name: "Remove region" }))
    expect(partitioningOf(harness.get())).toBe("")
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
