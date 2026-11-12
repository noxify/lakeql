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

/** An enabled, timestamp-mode mutation for seeding. */
function timestampState(fields: EditorState["fields"] = []): EditorState {
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
      partitioning: true,
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
function partitioningOf(editor: EditorApi): boolean | string {
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

  it("renders three rich radio choices with titles and descriptions", () => {
    const harness = renderWithEditor(() => <MutationConfigForm />)
    // Seed an enabled mutation so the partitioning picker renders.
    seed(harness.get(), timestampState())

    const group = screen.getByRole("radiogroup", {
      name: "Partitioning mode",
    })
    const scope = within(group)
    expect(scope.getByText("Off (flat layout)")).toBeDefined()
    expect(scope.getByText("By write timestamp")).toBeDefined()
    expect(scope.getByText("By field / custom format")).toBeDefined()
    // The timestamp description mentions the automatic load_timestamp DateTime.
    expect(scope.getByText(/load_timestamp DateTime field/u)).toBeDefined()
  })

  it("starts a freshly-enabled mutation in off mode (partitioning === false)", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    await user.click(screen.getByRole("switch", { name: "Enable mutation" }))
    expect(partitioningOf(harness.get())).toBeFalsy()
  })

  it("disables the timestamp card when a real load_timestamp field exists", () => {
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(
      harness.get(),
      timestampState([{ id: "f1", name: "load_timestamp", type: "DateTime" }])
    )
    const timestampCard = screen
      .getByText("By write timestamp")
      .closest("[data-slot='radio-card-item']")
    expect(
      defined(timestampCard as HTMLElement | null).dataset.disabled
    ).toBeDefined()
    expect(
      screen.getByText(/A field named load_timestamp already exists/u)
    ).toBeDefined()
  })

  it("keeps the granularity select distinct and available in timestamp mode", () => {
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(harness.get(), timestampState())
    const granularity = screen.getByLabelText("Partition granularity")
    expect(granularity).toBeDefined()
    // It offers the three granularity formats.
    expect(granularity.textContent).toContain("year/month/day")
  })
})

describe("PartitioningFieldPicker combobox", () => {
  afterEach(cleanup)

  it("resolves a String field to one option and a DateTime field to six", async () => {
    const user = userEvent.setup()
    const harness = renderWithEditor(() => <MutationConfigForm />)
    seed(harness.get(), {
      ...timestampState([
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
      ...timestampState([{ id: "f1", name: "created_at", type: "DateTime" }]),
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
      ...timestampState([{ id: "f1", name: "region", type: "String" }]),
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

describe("CanvasSurface derived load_timestamp row", () => {
  afterEach(cleanup)

  it("shows the read-only managed row in timestamp mode, even with zero fields", () => {
    const harness = renderCanvas()
    seed(harness.get(), timestampState())
    const row = screen.getByRole("group", {
      name: "load_timestamp (managed, read-only)",
    })
    // Its managed, read-only nature is conveyed through the accessible name.
    expect(row.getAttribute("aria-label")).toContain("read-only")
    // No editing affordances in the row.
    const scope = within(row)
    expect(scope.queryByLabelText("Field name")).toBeNull()
    expect(scope.queryByLabelText("Field type")).toBeNull()
    expect(scope.queryByLabelText("Remove field")).toBeNull()
    expect(scope.queryByLabelText("Move field")).toBeNull()
  })

  it("removes the row when leaving timestamp mode with no new history entry", () => {
    const harness = renderCanvas()
    seed(harness.get(), timestampState())
    expect(
      screen.queryByRole("group", {
        name: "load_timestamp (managed, read-only)",
      })
    ).not.toBeNull()

    const before = harness.get().canUndo
    act(() => {
      const current = harness.get().state
      harness.get().replaceState(
        {
          ...current,
          mutation: {
            ...current.mutation,
            partitioning: false,
          } as EditorState["mutation"],
        },
        { commit: false }
      )
    })
    expect(
      screen.queryByRole("group", {
        name: "load_timestamp (managed, read-only)",
      })
    ).toBeNull()
    // The row is view-only: toggling it via a non-committing edit did not add a
    // committed history entry (canUndo unchanged by the row itself).
    expect(harness.get().canUndo).toBe(before)
  })

  it("suppresses the derived row when a real load_timestamp field exists", () => {
    const harness = renderCanvas()
    seed(
      harness.get(),
      timestampState([{ id: "f1", name: "load_timestamp", type: "DateTime" }])
    )
    expect(
      screen.queryByRole("group", {
        name: "load_timestamp (managed, read-only)",
      })
    ).toBeNull()
  })
})
