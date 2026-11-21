// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { useEffect, useRef } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Canvas } from "@/components/studio/canvas/canvas"
import type { EditorApi } from "@/components/studio/use-editor"
import { EditorProvider, useEditor } from "@/components/studio/use-editor"
import { createField } from "@/core"

import { defined } from "./helpers"

/**
 * Component tests for palette-by-keyboard. These drive real key events through
 * the rendered `Canvas` DOM (jsdom) and assert the observable state change, the
 * single-snapshot commit, focus placement, and the live-region announcement.
 * Reordering is pointer-only by design, so there is no keyboard move mode.
 */

/** A probe that captures the live editor API for assertions. */
let bag: { api: EditorApi | null } = { api: null }

/** Seeds the given fields as a single committed snapshot. */
const Seed = ({
  api,
  build,
}: {
  api: EditorApi
  build: (api: EditorApi) => void
}): null => {
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) {
      return
    }
    seeded.current = true
    build(api)
  }, [api, build])
  return null
}

/** Renders the canvas under a fresh editor seeded by `build`. */
function renderCanvas(build: (api: EditorApi) => void): void {
  const Harness = (): ReactNode => {
    const api = useEditor()
    useEffect(() => {
      bag.api = api
    })
    return (
      <EditorProvider value={api}>
        <Seed api={api} build={build} />
        <Canvas />
      </EditorProvider>
    )
  }
  render(<Harness />)
}

/** The current editor API. */
function editor(): EditorApi {
  return defined(bag.api)
}

describe("keyboard palette-add", () => {
  beforeEach(() => {
    window.localStorage.clear()
    bag = { api: null }
  })
  afterEach(() => cleanup())

  it("adds a top-level field when nothing is selected", async () => {
    const user = userEvent.setup()
    renderCanvas(() => {
      /* empty canvas */
    })

    expect(editor().state.fields).toHaveLength(0)
    const addInteger = screen.getByLabelText("Add Integer field")
    addInteger.focus()
    await user.keyboard("{Enter}")

    expect(editor().state.fields).toHaveLength(1)
    expect(defined(editor().state.fields[0]).type).toBe("Integer")
  })

  it("moves focus to the new field's name input and announces the add", async () => {
    const user = userEvent.setup()
    renderCanvas(() => {
      /* empty canvas */
    })

    screen.getByLabelText("Add String field").focus()
    await user.keyboard("{Enter}")

    const nameInput = screen.getByLabelText("Field name")
    expect(document.activeElement).toBe(nameInput)
    expect(screen.getByTestId("canvas-announcer").textContent ?? "").toMatch(
      /Added a String field/u
    )
  })

  it("adds into the selected container and commits exactly one snapshot", async () => {
    const user = userEvent.setup()
    renderCanvas((api) => {
      const box = { ...createField("Object"), name: "box" }
      api.replaceState(
        {
          ...api.state,
          fields: [
            { ...box, fields: [{ ...createField("String"), name: "child" }] },
          ],
        },
        { commit: true }
      )
    })

    // Select the container's existing child, then add from the palette.
    const childInput = screen
      .getAllByLabelText("Field name")
      .find((n) => (n as HTMLInputElement).value === "child")
    await user.click(defined(childInput))

    const before = editor().state
    const addString = screen.getByLabelText("Add String field")
    addString.focus()
    await user.keyboard("{Enter}")

    // The new field landed inside "box" (as a sibling of "child").
    const boxChildren = defined(defined(editor().state.fields[0]).fields)
    expect(boxChildren).toHaveLength(2)

    // Exactly one snapshot: a single undo returns to the seeded state.
    expect(editor().state).not.toBe(before)
    act(() => editor().undo())
    expect(defined(editor().state.fields[0]).fields).toHaveLength(1)
  })
})
