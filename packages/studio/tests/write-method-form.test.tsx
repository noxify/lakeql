// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { MutationConfigForm } from "@/components/studio/mutation-config-form"
import type { EditorApi } from "@/components/studio/use-editor"
import { EditorProvider, useEditor } from "@/components/studio/use-editor"
import type { EditorState } from "@/core"
import { createFreshState, toDefinition } from "@/core"

import { defined } from "./helpers"

function stateWith(
  mutation: Partial<Extract<EditorState["mutation"], { enabled: true }>>,
  fields: EditorState["fields"] = []
): EditorState {
  return {
    ...createFreshState(),
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields,
    mutation: {
      enabled: true,
      loadStrategy: "append",
      writeMethod: "storage",
      basePath: "",
      partitioning: false,
      ...mutation,
    },
  }
}

function renderForm(initial: EditorState): { get: () => EditorApi } {
  const bag: { editor: EditorApi | null } = { editor: null }
  const Wrapper = (): ReactNode => {
    const editor = useEditor()
    useEffect(() => {
      bag.editor = editor
    })
    return (
      <EditorProvider value={editor}>
        <MutationConfigForm />
      </EditorProvider>
    )
  }
  render(<Wrapper />)
  act(() => {
    defined(bag.editor).replaceState(initial, { commit: true })
  })
  return { get: () => defined(bag.editor) }
}

const writeMethodOf = (editor: EditorApi): string | undefined =>
  editor.state.mutation.enabled ? editor.state.mutation.writeMethod : undefined

describe("write method control", () => {
  afterEach(cleanup)

  it("renders a labelled radio group with Storage selected", () => {
    renderForm(stateWith({ basePath: "/d" }))

    const group = screen.getByRole("radiogroup", { name: "Write method" })

    expect(within(group).getByRole("radio", { name: /Storage/u })).toBeDefined()
    expect(within(group).getByRole("radio", { name: /Insert/u })).toBeDefined()
    expect(screen.getByLabelText("Base path")).toBeDefined()
  })

  it("switches immediately when nothing would be discarded", async () => {
    const user = userEvent.setup()
    const harness = renderForm(stateWith({}))

    await user.click(screen.getByRole("radio", { name: /Insert/u }))

    expect(writeMethodOf(harness.get())).toBe("insert")
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("hides base path, partitioning and the write-timestamp helper for insert", async () => {
    const user = userEvent.setup()
    renderForm(stateWith({}))

    await user.click(screen.getByRole("radio", { name: /Insert/u }))

    expect(screen.queryByLabelText("Base path")).toBeNull()
    expect(
      screen.queryByRole("radiogroup", { name: "Partitioning mode" })
    ).toBeNull()
    expect(screen.queryByText("Add write-timestamp field")).toBeNull()
  })

  it("confirms with the discards listed, then applies with one undo", async () => {
    const user = userEvent.setup()
    const harness = renderForm(
      stateWith({ basePath: "/warehouse/events" }, [
        {
          id: "f1",
          name: "load_timestamp",
          type: "DateTime",
          options: { autoFill: "write_timestamp" },
        },
      ])
    )

    await user.click(screen.getByRole("radio", { name: /Insert/u }))
    const dialog = screen.getByRole("alertdialog")

    expect(within(dialog).getByText("/warehouse/events")).toBeDefined()
    expect(dialog.textContent).toContain("stops being filled by the server")
    expect(dialog.textContent).toContain("load_timestamp_year")

    await user.click(
      within(dialog).getByRole("button", { name: "Switch to insert" })
    )

    expect(toDefinition(harness.get().state).mutation).toStrictEqual({
      loadStrategy: "append",
      writeMethod: "insert",
    })
    expect(harness.get().state.fields[0]).not.toHaveProperty("options")
  })

  it("restores everything with a single undo after the switch", async () => {
    const user = userEvent.setup()
    const harness = renderForm(
      stateWith({ basePath: "/d" }, [
        {
          id: "f1",
          name: "load_timestamp",
          type: "DateTime",
          options: { autoFill: "write_timestamp" },
        },
      ])
    )
    await user.click(screen.getByRole("radio", { name: /Insert/u }))
    await user.click(screen.getByRole("button", { name: "Switch to insert" }))

    act(() => harness.get().undo())

    expect(writeMethodOf(harness.get())).toBe("storage")
    expect(harness.get().state.fields[0]?.options?.autoFill).toBe(
      "write_timestamp"
    )
  })

  it("keeps storage when the dialog is cancelled", async () => {
    const user = userEvent.setup()
    const harness = renderForm(stateWith({ basePath: "/d" }))

    await user.click(screen.getByRole("radio", { name: /Insert/u }))
    await user.click(screen.getByRole("button", { name: "Keep storage" }))

    expect(writeMethodOf(harness.get())).toBe("storage")
    expect(
      screen
        .getByRole("radio", { name: /Storage/u })
        .getAttribute("aria-checked")
    ).toBe("true")
    expect(harness.get().state.mutation).toMatchObject({ basePath: "/d" })
  })

  it("shows the required base path state when switching back to storage", async () => {
    const user = userEvent.setup()
    renderForm(stateWith({ writeMethod: "insert" }))

    await user.click(screen.getByRole("radio", { name: /Storage/u }))

    expect(screen.getByText(/non-empty base path is required/u)).toBeDefined()
  })
})
