// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { useEffect, useRef } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createField } from "@/core"
import { Canvas } from "@/ui/canvas/canvas"
import type { EditorApi } from "@/ui/use-editor"
import { EditorProvider, useEditor } from "@/ui/use-editor"

import { defined } from "./helpers"

/**
 * Component tests for the keyboard "grab / move / drop" mode and
 * palette-by-keyboard (task 16). These drive real key events through the
 * rendered `Canvas` DOM (jsdom) and assert the observable state change, the
 * single-snapshot commit, the rejection surface, focus restoration, and the
 * live-region announcement — the deterministic, DOM-driven subset the Phase-E
 * E2E then re-asserts in a real browser.
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

/** The top-level field names in order. */
function topNames(): string[] {
  return editor().state.fields.map((field) => field.name)
}

/** Seeds three top-level primitives a, b, c as one committed snapshot. */
function seedThree(api: EditorApi): void {
  api.replaceState(
    {
      ...api.state,
      fields: [
        { ...createField("String"), name: "a" },
        { ...createField("String"), name: "b" },
        { ...createField("String"), name: "c" },
      ],
    },
    { commit: true }
  )
}

/** The "Move field" button inside the node whose name input has `value`. */
function moveButtonFor(name: string): HTMLElement {
  const input = screen
    .getAllByLabelText("Field name")
    .find((n) => (n as HTMLInputElement).value === name)
  const group = defined(input).closest('[role="group"]')
  // A container node's group also contains its children's Move buttons; the
  // node's own button is the first in DOM order (the controls row precedes the
  // nested container zone).
  return defined(
    within(defined(group as HTMLElement)).getAllByLabelText("Move field")[0]
  )
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

describe("keyboard grab / move / drop", () => {
  beforeEach(() => {
    window.localStorage.clear()
    bag = { api: null }
  })
  afterEach(() => cleanup())

  it("reorders within a level and commits exactly one snapshot", async () => {
    const user = userEvent.setup()
    renderCanvas(seedThree)

    const moveA = moveButtonFor("a")
    moveA.focus()
    // Pick up "a" (cursor starts before "a"), step down to before "c", drop.
    await user.keyboard("{Enter}")
    await user.keyboard("{ArrowDown}{ArrowDown}")
    await user.keyboard("{Enter}")

    expect(topNames()).toStrictEqual(["b", "a", "c"])

    // Exactly one snapshot: one undo restores the original order.
    act(() => editor().undo())
    expect(topNames()).toStrictEqual(["a", "b", "c"])
  })

  it("moves a field across levels into a container", async () => {
    const user = userEvent.setup()
    renderCanvas((api) => {
      const box = { ...createField("Object"), name: "box" }
      api.replaceState(
        {
          ...api.state,
          fields: [
            { ...createField("String"), name: "leaf" },
            { ...box, fields: [{ ...createField("String"), name: "seed" }] },
          ],
        },
        { commit: true }
      )
    })

    const moveLeaf = moveButtonFor("leaf")
    moveLeaf.focus()
    await user.keyboard("{Enter}")
    // Step the cursor to the append slot inside "box". Slots in order:
    // before leaf, before box, before seed (inside box), append box, append top.
    // From "before leaf", three downs reach "append box".
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}")
    await user.keyboard("{Enter}")

    expect(topNames()).toStrictEqual(["box"])
    const boxChildren = defined(defined(editor().state.fields[0]).fields)
    expect(boxChildren.map((f) => f.name)).toStrictEqual(["seed", "leaf"])
  })

  it("a self-containing move makes no change and surfaces the reason", async () => {
    const user = userEvent.setup()
    renderCanvas((api) => {
      // obj > inner (both Objects); grab obj and target inside inner.
      api.replaceState(
        {
          ...api.state,
          fields: [
            {
              ...createField("Object"),
              name: "obj",
              fields: [{ ...createField("Object"), name: "inner", fields: [] }],
            },
          ],
        },
        { commit: true }
      )
    })

    const before = editor().state
    const moveObj = moveButtonFor("obj")
    moveObj.focus()
    await user.keyboard("{Enter}")
    // Slots: before obj, before inner (inside obj), append inner (inside inner),
    // append obj, append top. Navigate to "append inner" — self-containing.
    await user.keyboard("{ArrowDown}{ArrowDown}")

    // The rejection reason is surfaced via the shared role="alert".
    const alert = screen.getByRole("alert")
    expect(alert.textContent ?? "").toMatch(/descendant|itself|not possible/u)

    // Enter on an invalid slot does not mutate.
    await user.keyboard("{Enter}")
    expect(editor().state).toBe(before)
  })

  it("cancel restores focus to the source node and makes no change", async () => {
    const user = userEvent.setup()
    renderCanvas(seedThree)

    const before = editor().state
    const moveB = moveButtonFor("b")
    moveB.focus()
    await user.keyboard("{Enter}")
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{Escape}")

    expect(editor().state).toBe(before)
    // Focus returned to "b"'s Move button.
    expect(document.activeElement).toBe(moveButtonFor("b"))
  })

  it("restores focus to the moved field after a commit", async () => {
    const user = userEvent.setup()
    renderCanvas(seedThree)

    const moveA = moveButtonFor("a")
    moveA.focus()
    await user.keyboard("{Enter}")
    await user.keyboard("{ArrowDown}{ArrowDown}")
    await user.keyboard("{Enter}")

    // After the reorder, focus lands on the moved field's Move button.
    expect(topNames()).toStrictEqual(["b", "a", "c"])
    expect(document.activeElement).toBe(moveButtonFor("a"))
  })

  it("announces pick-up, target change, and drop in the live region", async () => {
    const user = userEvent.setup()
    renderCanvas(seedThree)

    const announcer = screen.getByTestId("keyboard-move-announcer")
    const moveA = moveButtonFor("a")
    moveA.focus()

    await user.keyboard("{Enter}")
    expect(announcer.textContent ?? "").toMatch(/Picked up/u)

    await user.keyboard("{ArrowDown}")
    expect(announcer.textContent ?? "").toMatch(/before|end of/iu)

    await user.keyboard("{Enter}")
    expect(announcer.textContent ?? "").toMatch(/Dropped/u)
  })
})
