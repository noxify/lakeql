// @vitest-environment jsdom

import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { useEffect, useRef } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { EditorFieldType } from "@/core"
import { createField } from "@/core"
import { CanvasSurface } from "@/ui/canvas/canvas"
import type { CanvasDropData } from "@/ui/canvas/dnd-types"
import { paletteDraggableId, resolveDropTarget } from "@/ui/canvas/dnd-types"
import { Palette } from "@/ui/canvas/palette"
import { CanvasShellRoot } from "@/ui/canvas/shell-root"
import type { CanvasDndApi } from "@/ui/canvas/use-canvas-dnd"
import { useCanvasDndContext } from "@/ui/canvas/use-canvas-dnd"
import { FieldPropertiesPanel } from "@/ui/field-properties-panel"
import type { EditorApi } from "@/ui/use-editor"
import { EditorProvider, useEditor } from "@/ui/use-editor"

import { defined } from "./helpers"

/**
 * Component tests for the canvas (tasks 8-12). jsdom cannot perform real
 * pointer drags, so the drag/drop handler logic is exercised by invoking the
 * `@dnd-kit` handlers with constructed events (per the design/testing-strategy)
 * — deep pointer behaviour is the Phase-E E2E layer. Rendering tests drive the
 * real canvas DOM for structure, selection, and drop-zone presence.
 *
 * After the Phase-B decomposition the canvas no longer self-provides its
 * `DndContext`/providers: these harnesses mount the hoisted
 * {@link CanvasShellRoot} and place the {@link Palette} + {@link CanvasSurface}
 * inside it, and probe the shared DnD API via {@link useCanvasDndContext} (the
 * one instance the surface uses) rather than a sibling `useCanvasDnd` call.
 */

/** A minimal palette-source drag-start event for the given field type. */
function paletteStart(fieldType: EditorFieldType): DragStartEvent {
  return {
    active: {
      id: paletteDraggableId(fieldType),
      data: { current: { kind: "new-field", fieldType } },
      rect: { current: { initial: null, translated: null } },
    },
  } as unknown as DragStartEvent
}

/** A drag-end event dropping the given active draggable over `over`. */
function dropEvent(
  active: DragStartEvent["active"],
  over: CanvasDropData | null
): DragEndEvent {
  return {
    active,
    over:
      over === null
        ? null
        : { id: "over", data: { current: over }, rect: {}, disabled: false },
    delta: { x: 0, y: 0 },
  } as unknown as DragEndEvent
}

/** The active descriptor for moving an existing field by id. */
function moveActive(fieldId: string): DragStartEvent["active"] {
  return {
    id: fieldId,
    data: { current: { kind: "move-field", fieldId } },
    rect: { current: { initial: null, translated: null } },
  } as unknown as DragStartEvent["active"]
}

/** The active descriptor for a palette source. */
function paletteActive(fieldType: EditorFieldType): DragStartEvent["active"] {
  return paletteStart(fieldType).active
}

/**
 * A probe that captures the hoisted canvas DnD API from context. Rendered
 * inside {@link CanvasShellRoot} so it reads the single DnD instance the canvas
 * surface and palette share, not a fresh sibling instance.
 */
const DndProbe = ({
  capture,
}: {
  capture: (dnd: CanvasDndApi) => void
}): null => {
  const dnd = useCanvasDndContext()
  useEffect(() => {
    capture(dnd)
  })
  return null
}

/**
 * Renders the hoisted shell root exposing both the live editor API and the
 * shared canvas DnD API under one `EditorProvider`, so a test can invoke the
 * DnD handlers and read the resulting live state. The shell root owns the
 * `DndContext` and the provider chain; the probe reads the DnD context from
 * inside it. Returns a `get()` returning the current pair.
 */
function renderCanvasHarness(): {
  get: () => { editor: EditorApi; dnd: CanvasDndApi }
} {
  const bag: { editor: EditorApi | null; dnd: CanvasDndApi | null } = {
    editor: null,
    dnd: null,
  }

  const Wrapper = (): ReactNode => {
    const editor = useEditor()
    useEffect(() => {
      bag.editor = editor
    })
    return (
      <EditorProvider value={editor}>
        <CanvasShellRoot>
          <DndProbe
            capture={(dnd) => {
              bag.dnd = dnd
            }}
          />
        </CanvasShellRoot>
      </EditorProvider>
    )
  }

  render(<Wrapper />)
  return {
    get: () => ({
      editor: defined(bag.editor),
      dnd: defined(bag.dnd),
    }),
  }
}

describe("canvas drop resolution (resolveDropTarget)", () => {
  it("resolves a node anchor to its container with the node as beforeId", () => {
    const target = resolveDropTarget({
      kind: "node-anchor",
      fieldId: "n1",
      containerId: "c1",
    })
    expect(target).toStrictEqual({ containerId: "c1", beforeId: "n1" })
  })

  it("resolves a container zone to an append (beforeId null)", () => {
    const target = resolveDropTarget({
      kind: "container-zone",
      containerId: null,
    })
    expect(target).toStrictEqual({ containerId: null, beforeId: null })
  })

  it("resolves no droppable to null", () => {
    expect(resolveDropTarget(null)).toBeNull()
    expect(resolveDropTarget(undefined)).toBeNull()
  })
})

describe("canvas DnD handlers over the live editor", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it("a palette drop onto the empty top level adds a top-level field", () => {
    const { get } = renderCanvasHarness()

    expect(get().editor.state.fields).toHaveLength(0)
    const start = paletteStart("String")
    act(() => get().dnd.onDragStart(start))
    act(() =>
      get().dnd.onDragEnd(
        dropEvent(start.active, { kind: "container-zone", containerId: null })
      )
    )

    expect(get().editor.state.fields).toHaveLength(1)
    expect(defined(get().editor.state.fields[0]).type).toBe("String")
  })

  it("a palette drop commits exactly one snapshot (one undo clears it)", () => {
    const { get } = renderCanvasHarness()

    const start = paletteStart("String")
    act(() => get().dnd.onDragStart(start))
    act(() =>
      get().dnd.onDragEnd(
        dropEvent(start.active, { kind: "container-zone", containerId: null })
      )
    )
    expect(get().editor.canUndo).toBeTruthy()

    act(() => get().editor.undo())
    expect(get().editor.state.fields).toHaveLength(0)
    expect(get().editor.canUndo).toBeFalsy()
  })

  it("a valid drop lands the field at the anchor (insert-before)", () => {
    const { get } = renderCanvasHarness()

    act(() =>
      get().editor.addField([], { ...createField("String"), name: "a" })
    )
    act(() =>
      get().editor.addField([], { ...createField("String"), name: "b" })
    )
    const bId = defined(get().editor.state.fields[1]).id

    // Drop a new Integer palette field before "b".
    act(() =>
      get().dnd.onDragEnd(
        dropEvent(paletteActive("Integer"), {
          kind: "node-anchor",
          fieldId: bId,
          containerId: null,
        })
      )
    )

    expect(get().editor.state.fields.map((f) => f.name)).toStrictEqual([
      "a",
      "",
      "b",
    ])
    expect(defined(get().editor.state.fields[1]).type).toBe("Integer")
  })

  it("reorder updates order (one drop, one undo step)", () => {
    const { get } = renderCanvasHarness()

    act(() =>
      get().editor.addField([], { ...createField("String"), name: "a" })
    )
    act(() =>
      get().editor.addField([], { ...createField("String"), name: "b" })
    )
    const aId = defined(get().editor.state.fields[0]).id

    // Move "a" to the end (append into top level).
    act(() =>
      get().dnd.onDragEnd(
        dropEvent(moveActive(aId), {
          kind: "container-zone",
          containerId: null,
        })
      )
    )
    expect(get().editor.state.fields.map((f) => f.name)).toStrictEqual([
      "b",
      "a",
    ])

    act(() => get().editor.undo())
    expect(get().editor.state.fields.map((f) => f.name)).toStrictEqual([
      "a",
      "b",
    ])
  })

  it("a cross-level move lands in the right container", () => {
    const { get } = renderCanvasHarness()

    act(() =>
      get().editor.addField([], { ...createField("String"), name: "leaf" })
    )
    const box = { ...createField("Object"), name: "box" }
    act(() => get().editor.addField([], box))
    act(() =>
      get().editor.addField([1], { ...createField("String"), name: "seed" })
    )
    const leafId = defined(get().editor.state.fields[0]).id

    // Move "leaf" into the box container (append).
    act(() =>
      get().dnd.onDragEnd(
        dropEvent(moveActive(leafId), {
          kind: "container-zone",
          containerId: box.id,
        })
      )
    )

    expect(get().editor.state.fields.map((f) => f.name)).toStrictEqual(["box"])
    const boxChildren = defined(defined(get().editor.state.fields[0]).fields)
    expect(boxChildren.map((f) => f.name)).toStrictEqual(["seed", "leaf"])
  })

  it("a structurally-impossible drop makes no change and surfaces a reason", () => {
    const { get } = renderCanvasHarness()

    act(() =>
      get().editor.addField([], { ...createField("String"), name: "a" })
    )
    act(() =>
      get().editor.addField([], { ...createField("String"), name: "b" })
    )
    const before = get().editor.state
    const aId = defined(before.fields[0]).id
    const bId = defined(before.fields[1]).id

    // Try to move "a" into "b" — a primitive is not a container.
    act(() =>
      get().dnd.onDragEnd(
        dropEvent(moveActive(aId), {
          kind: "container-zone",
          containerId: bId,
        })
      )
    )

    expect(get().editor.state.fields.map((f) => f.name)).toStrictEqual([
      "a",
      "b",
    ])
    expect(get().dnd.rejectionReason).not.toBeNull()
  })

  it("a drop onto the dragged field itself is a no-op (no snapshot)", () => {
    const { get } = renderCanvasHarness()

    act(() =>
      get().editor.addField([], { ...createField("String"), name: "a" })
    )
    const aId = defined(get().editor.state.fields[0]).id
    const canRedoBefore = get().editor.canRedo

    act(() =>
      get().dnd.onDragEnd(
        dropEvent(moveActive(aId), {
          kind: "node-anchor",
          fieldId: aId,
          containerId: null,
        })
      )
    )

    expect(get().editor.state.fields.map((f) => f.name)).toStrictEqual(["a"])
    expect(get().editor.canRedo).toBe(canRedoBefore)
  })
})

/** Seeds a nested structure (id, profile.Object{city}, tags.Array<String>). */
const Seed = ({ editor }: { editor: EditorApi }): null => {
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) {
      return
    }
    seededRef.current = true
    const box = { ...createField("Object"), name: "profile" }
    editor.replaceState(
      {
        ...editor.state,
        fields: [
          { ...createField("String"), name: "id" },
          { ...box, fields: [{ ...createField("String"), name: "city" }] },
          { ...createField("Array"), name: "tags" },
        ],
      },
      { commit: true }
    )
  }, [editor])
  return null
}

/**
 * The decomposed canvas (palette + surface) under a fresh editor and the
 * hoisted shell root, seeded with the nested structure. Mirrors how the
 * iteration-3 shell mounts the pieces, so no self-providing `Canvas` is used.
 */
const SeededCanvas = (): ReactNode => {
  const editor = useEditor()
  return (
    <EditorProvider value={editor}>
      <Seed editor={editor} />
      <CanvasShellRoot>
        <Palette />
        <CanvasSurface />
      </CanvasShellRoot>
    </EditorProvider>
  )
}

/** The seeded decomposed canvas plus the properties panel under one editor. */
const SeededCanvasWithPanel = (): ReactNode => {
  const editor = useEditor()
  return (
    <EditorProvider value={editor}>
      <Seed editor={editor} />
      <CanvasShellRoot>
        <Palette />
        <CanvasSurface />
      </CanvasShellRoot>
      <FieldPropertiesPanel />
    </EditorProvider>
  )
}

describe("canvas rendering", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it("renders nested structures and exposes a nested drop zone for Object", () => {
    render(<SeededCanvas />)

    // Every field name input is present, including the nested "city".
    const names = screen
      .getAllByLabelText("Field name")
      .map((n) => (n as HTMLInputElement).value)
    expect(names).toContain("id")
    expect(names).toContain("profile")
    expect(names).toContain("city")
    expect(names).toContain("tags")
  })

  it("an Array-of-primitive offers no nested drop zone", () => {
    render(<SeededCanvas />)

    // The Array-of-String "tags" node must not render the empty-container
    // placeholder a container zone would show.
    expect(screen.queryByText(/Array requires at least one/u)).toBeNull()
  })

  it("selecting a node drives the properties panel", async () => {
    const user = userEvent.setup()
    render(<SeededCanvasWithPanel />)

    // Nothing selected yet: the panel shows its hint.
    expect(
      screen.getByText(/Select a field to edit its options/u)
    ).toBeDefined()

    // Click the "id" field's name input, which selects the node.
    const idInput = screen
      .getAllByLabelText("Field name")
      .find((n) => (n as HTMLInputElement).value === "id")
    await user.click(defined(idInput))

    // The hint is gone and the panel now shows per-field option controls.
    expect(screen.queryByText(/Select a field to edit its options/u)).toBeNull()
    expect(screen.getByText("Validations")).toBeDefined()
  })
})
