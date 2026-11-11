// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createField } from "@/core"
import { UndoRedoControls, useUndoRedoShortcuts } from "@/ui/undo-redo-controls"
import type { EditorApi } from "@/ui/use-editor"
import { EditorProvider, useEditor } from "@/ui/use-editor"

import { defined } from "./helpers"

/**
 * Tests for the on-screen undo/redo controls and their keyboard shortcuts.
 * They render the real controls over a live editor and assert the buttons move
 * the live state, disable at the ends, and that the `Ctrl/Cmd+Z` /
 * `Ctrl/Cmd+Shift+Z` shortcuts drive the same path. The shortcut listener now
 * lives in {@link useUndoRedoShortcuts} (mounted globally at the shell root),
 * so the keyboard harness mounts the hook alongside the buttons.
 */

/** Mounts the global undo/redo shortcut hook without rendering any UI. */
const Shortcuts = (): null => {
  useUndoRedoShortcuts()
  return null
}

/** Captures the live editor API while rendering the controls under it. */
function renderControls(): { get: () => EditorApi } {
  const bag: { editor: EditorApi | null } = { editor: null }
  const Harness = (): ReactNode => {
    const editor = useEditor()
    useEffect(() => {
      bag.editor = editor
    })
    return (
      <EditorProvider value={editor}>
        <Shortcuts />
        <UndoRedoControls />
      </EditorProvider>
    )
  }
  render(<Harness />)
  return { get: () => defined(bag.editor) }
}

/** The undo button, by its accessible name. */
function undoButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement
}

/** The redo button, by its accessible name. */
function redoButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement
}

describe("undo/redo controls", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it("disables undo at the start and redo until an undo happens", () => {
    const { get } = renderControls()
    expect(undoButton().disabled).toBeTruthy()
    expect(redoButton().disabled).toBeTruthy()

    act(() => get().addField([], { ...createField("String"), name: "a" }))
    expect(undoButton().disabled).toBeFalsy()
    expect(redoButton().disabled).toBeTruthy()
  })

  it("the buttons move the live state", () => {
    const { get } = renderControls()
    act(() => get().addField([], { ...createField("String"), name: "a" }))
    expect(get().state.fields).toHaveLength(1)

    fireEvent.click(undoButton())
    expect(get().state.fields).toHaveLength(0)

    fireEvent.click(redoButton())
    expect(get().state.fields).toHaveLength(1)
  })

  it("the keyboard shortcuts undo and redo", () => {
    const { get } = renderControls()
    act(() => get().addField([], { ...createField("String"), name: "a" }))
    expect(get().state.fields).toHaveLength(1)

    // Ctrl+Z undoes.
    act(() => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true })
    })
    expect(get().state.fields).toHaveLength(0)

    // Ctrl+Shift+Z redoes.
    act(() => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true })
    })
    expect(get().state.fields).toHaveLength(1)

    // Ctrl+Y also redoes (after another undo).
    act(() => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true })
    })
    expect(get().state.fields).toHaveLength(0)
    act(() => {
      fireEvent.keyDown(window, { key: "y", ctrlKey: true })
    })
    expect(get().state.fields).toHaveLength(1)
  })

  it("ignores the shortcut while typing in a text input", () => {
    const { get } = renderControls()
    act(() => get().addField([], { ...createField("String"), name: "a" }))

    const input = document.createElement("input")
    document.body.append(input)
    input.focus()

    act(() => {
      fireEvent.keyDown(input, { key: "z", ctrlKey: true })
    })
    // The field is untouched: the shortcut did not hijack the input undo.
    expect(get().state.fields).toHaveLength(1)
    input.remove()
  })
})
