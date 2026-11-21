// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { CanvasSurface } from "@/components/studio/canvas/canvas"
import { CanvasShellRoot } from "@/components/studio/canvas/shell-root"
import type { EditorApi } from "@/components/studio/use-editor"
import { EditorProvider, useEditor } from "@/components/studio/use-editor"
import type { EditorState } from "@/core"
import { createFreshState, serializePartitionSegments } from "@/core"

import { defined } from "./helpers"

/** Three fields; partitioning uses `created_at` (year/month) and `region`. */
function partitionedState(): EditorState {
  return {
    ...createFreshState(),
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields: [
      { id: "ts", name: "created_at", type: "DateTime" },
      { id: "rg", name: "region", type: "String" },
      { id: "ot", name: "other", type: "String" },
    ],
    mutation: {
      enabled: true,
      loadStrategy: "append",
      basePath: "/d",
      partitioning: [
        { fieldId: "ts", component: "year" },
        { fieldId: "rg" },
        { fieldId: "ts", component: "month" },
      ],
      partitioningFormat: "year/month/day",
    },
  }
}

/** Renders the canvas under a live editor and exposes the editor API. */
function renderCanvas(): { get: () => EditorApi } {
  const bag: { editor: EditorApi | null } = { editor: null }
  const Wrapper = (): ReactNode => {
    const editor = useEditor()
    useEffect(() => {
      bag.editor = editor
    })
    return (
      <EditorProvider value={editor}>
        <CanvasShellRoot>
          <CanvasSurface />
        </CanvasShellRoot>
      </EditorProvider>
    )
  }
  render(<Wrapper />)
  return { get: () => defined(bag.editor) }
}

/** The exported partition string of the current editor state. */
function partitionString(editor: EditorApi): string {
  const { mutation } = editor.state
  if (!mutation.enabled || mutation.partitioning === false) {
    throw new Error("expected by-field partitioning")
  }
  return serializePartitionSegments(mutation.partitioning, editor.state.fields)
}

/** Clicks the "Remove field" button of the canvas node at `index`. */
async function clickRemove(
  user: ReturnType<typeof userEvent.setup>,
  index: number
): Promise<void> {
  const button = screen.getAllByRole("button", { name: "Remove field" })[index]
  await user.click(defined(button))
}

/** Opens the Base UI select trigger and picks `optionName`. */
async function selectType(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  optionName: string
): Promise<void> {
  const trigger = defined(screen.getAllByLabelText("Field type")[index])
  trigger.focus()
  await user.keyboard("{Enter}")
  await user.click(await screen.findByRole("option", { name: optionName }))
}

describe("removing a partition-referenced field from the canvas", () => {
  afterEach(cleanup)

  it("removes an unreferenced field without a confirmation", async () => {
    const user = userEvent.setup()
    const harness = renderCanvas()
    act(() => {
      harness.get().replaceState(partitionedState(), { commit: true })
    })

    await clickRemove(user, 2)

    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(harness.get().state.fields.map((field) => field.name)).toStrictEqual(
      ["created_at", "region"]
    )
    expect(partitionString(harness.get())).toBe(
      "created_at:year/region/created_at:month"
    )
  })

  it("names the affected segments and removes field and segments in one undo step on confirm", async () => {
    const user = userEvent.setup()
    const harness = renderCanvas()
    act(() => {
      harness.get().replaceState(partitionedState(), { commit: true })
    })

    await clickRemove(user, 0)

    const dialog = await screen.findByRole("alertdialog")
    expect(
      within(dialog).getByText("created_at → year, created_at → month")
    ).toBeDefined()
    // Nothing is removed while the dialog is open.
    expect(harness.get().state.fields).toHaveLength(3)

    await user.click(
      within(dialog).getByRole("button", { name: "Remove field and segments" })
    )

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull()
    })
    expect(harness.get().state.fields.map((field) => field.name)).toStrictEqual(
      ["region", "other"]
    )
    expect(partitionString(harness.get())).toBe("region")

    // One snapshot: a single undo restores both the field and its segments.
    act(() => harness.get().undo())
    expect(partitionString(harness.get())).toBe(
      "created_at:year/region/created_at:month"
    )
  })

  it("leaves an empty by-field selection when the last segment's field is removed", async () => {
    const user = userEvent.setup()
    const harness = renderCanvas()
    act(() => {
      harness.get().replaceState(
        {
          ...partitionedState(),
          mutation: {
            enabled: true,
            loadStrategy: "append",
            basePath: "/d",
            partitioning: [{ fieldId: "rg" }],
            partitioningFormat: "year/month/day",
          },
        },
        { commit: true }
      )
    })

    await clickRemove(user, 1)
    const dialog = await screen.findByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: "Remove field and segments" })
    )

    await waitFor(() => {
      expect(harness.get().state.fields).toHaveLength(2)
    })
    expect(harness.get().state.mutation).toMatchObject({ partitioning: [] })
  })

  it("deletes nothing on cancel", async () => {
    const user = userEvent.setup()
    const harness = renderCanvas()
    const before = partitionedState()
    act(() => {
      harness.get().replaceState(before, { commit: true })
    })

    await clickRemove(user, 0)
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Keep field" }))

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull()
    })
    expect(harness.get().state.fields).toHaveLength(3)
    expect(harness.get().state.mutation).toStrictEqual(before.mutation)
  })
})

describe("changing the type of a partition-referenced field", () => {
  afterEach(cleanup)

  it("confirms, names the segments, and applies type change and segment removal together", async () => {
    const user = userEvent.setup()
    const harness = renderCanvas()
    act(() => {
      harness.get().replaceState(partitionedState(), { commit: true })
    })

    // DateTime -> String invalidates the `:year`/`:month` components even
    // though no structure would be lost.
    await selectType(user, 0, "String")

    const dialog = await screen.findByRole("alertdialog")
    expect(
      within(dialog).getByText(/created_at → year, created_at → month/u)
    ).toBeDefined()
    expect(defined(harness.get().state.fields[0]).type).toBe("DateTime")

    await user.click(
      within(dialog).getByRole("button", { name: "Discard and change" })
    )
    await waitFor(() => {
      expect(defined(harness.get().state.fields[0]).type).toBe("String")
    })
    expect(partitionString(harness.get())).toBe("region")

    act(() => harness.get().undo())
    expect(defined(harness.get().state.fields[0]).type).toBe("DateTime")
    expect(partitionString(harness.get())).toBe(
      "created_at:year/region/created_at:month"
    )
  })

  it("changes nothing on cancel", async () => {
    const user = userEvent.setup()
    const harness = renderCanvas()
    const before = partitionedState()
    act(() => {
      harness.get().replaceState(before, { commit: true })
    })

    await selectType(user, 0, "String")
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Keep field" }))

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull()
    })
    expect(defined(harness.get().state.fields[0]).type).toBe("DateTime")
    expect(harness.get().state.mutation).toStrictEqual(before.mutation)
  })

  it("applies a type change that affects no segment without a prompt", async () => {
    const user = userEvent.setup()
    const harness = renderCanvas()
    act(() => {
      harness.get().replaceState(partitionedState(), { commit: true })
    })

    // `region` is partitioned bare: String -> Integer stays valid.
    await selectType(user, 1, "Integer")

    await waitFor(() => {
      expect(defined(harness.get().state.fields[1]).type).toBe("Integer")
    })
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(partitionString(harness.get())).toBe(
      "created_at:year/region/created_at:month"
    )
  })
})

describe("renaming a partition-referenced field", () => {
  afterEach(cleanup)

  it("keeps its segments attached and exports the new name", () => {
    const harness = renderCanvas()
    act(() => {
      harness.get().replaceState(partitionedState(), { commit: true })
    })

    act(() => harness.get().renameField([0], "written_at"))

    expect(partitionString(harness.get())).toBe(
      "written_at:year/region/written_at:month"
    )
  })
})
