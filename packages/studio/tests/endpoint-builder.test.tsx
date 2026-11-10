// @vitest-environment jsdom

import type { DragEndEvent } from "@dnd-kit/core"
import type { EndpointDefinitionFormat } from "@lakeql/schema-generator/endpoint-schema"
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
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { EditorFieldType } from "@/core"
import { Canvas } from "@/ui/canvas/canvas"
import type { CanvasDropData } from "@/ui/canvas/dnd-types"
import { paletteDraggableId } from "@/ui/canvas/dnd-types"
import type { CanvasDndApi } from "@/ui/canvas/use-canvas-dnd"
import { useCanvasDnd } from "@/ui/canvas/use-canvas-dnd"
import { EndpointBuilder } from "@/ui/endpoint-builder"
import { FieldPropertiesPanel } from "@/ui/field-properties-panel"
import type { EditorApi } from "@/ui/use-editor"
import { EditorProvider, useEditor } from "@/ui/use-editor"

import { defined } from "./helpers"

/**
 * Rendered-UI integration tests for the Endpoint Builder — the Iteration-1
 * behaviours the pure core tests cannot reach (Req 1.5 parity, 8.1, 8.2, 9.1,
 * 9.3, 3.10), rewritten for the Iteration-2 **canvas** surface (the tree is
 * gone). They render the real UI in jsdom and drive it the way a user would, so
 * they assert the wiring between the UI and the already-unit-tested core.
 *
 * The canvas reuses the Iteration-1 `aria-label`s (`"Field name"`,
 * `"Field type"`, `"Array item type"`, `"Remove field"`), so the metadata /
 * import / export / dialog assertions survive the surface swap and drive the
 * full {@link EndpointBuilder}. Only the structural actions differ: on the
 * canvas, adding and nesting a field is drag-driven. jsdom cannot perform real
 * pointer drags, so — exactly as the Phase-C canvas component tests do — those
 * actions are exercised by invoking the `@dnd-kit` drop handler with
 * constructed events over a live `Canvas`.
 *
 * Assertions use plain Vitest matchers over DOM properties (no `jest-dom`
 * dependency), reading `.value`/`.disabled`/`aria-checked` directly.
 */

const EXPORT_NAME = /export/iu

const validDefinition: EndpointDefinitionFormat = {
  version: "1.0",
  tableName: "events",
  catalog: "main",
  schema: "public",
  dataSource: "warehouse",
  fields: [
    { name: "id", type: "String", options: { required: true } },
    {
      name: "profile",
      type: "Object",
      fields: [{ name: "city", type: "String" }],
    },
  ],
  mutation: { loadStrategy: "append", basePath: "/data" },
}

/** Builds a `File` carrying `contents` as the user's import selection. */
function jsonFile(contents: string, name = "endpoint.json"): File {
  return new File([contents], name, { type: "application/json" })
}

/** The hidden file input the import button drives. */
function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (input === null) {
    throw new Error("file input not found")
  }
  return input
}

/** The current values of every "Field name" input on the canvas. */
function fieldNameValues(): string[] {
  return screen
    .getAllByLabelText("Field name")
    .map((node) => (node as HTMLInputElement).value)
}

/** The "Field type" select at a given canvas-node index. */
function typeSelectAt(index: number): HTMLElement {
  const select = screen.getAllByLabelText("Field type")[index]
  if (select === undefined) {
    throw new Error(`no field-type select at index ${index}`)
  }
  return select
}

/**
 * Opens a Base UI `Select` (a `combobox`) and picks the named option. The
 * popup opens on keyboard activation rather than a bare click under jsdom
 * (no pointer/layout), so we focus the trigger, open with Enter, then click
 * the option.
 */
async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  optionName: string
): Promise<void> {
  trigger.focus()
  await user.keyboard("{Enter}")
  const option = await screen.findByRole("option", { name: optionName })
  await user.click(option)
}

/** The active descriptor for a palette source of the given field type. */
function paletteActive(fieldType: EditorFieldType): DragEndEvent["active"] {
  return {
    id: paletteDraggableId(fieldType),
    data: { current: { kind: "new-field", fieldType } },
    rect: { current: { initial: null, translated: null } },
  } as unknown as DragEndEvent["active"]
}

/** A drag-end event dropping the given active draggable over `over`. */
function dropEvent(
  active: DragEndEvent["active"],
  over: CanvasDropData
): DragEndEvent {
  return {
    active,
    over: { id: "over", data: { current: over }, rect: {}, disabled: false },
    delta: { x: 0, y: 0 },
  } as unknown as DragEndEvent
}

/**
 * Renders the real {@link Canvas} and {@link FieldPropertiesPanel} under one
 * live editor, exposing both the editor API and the canvas DnD API so a test
 * can invoke the drop handler (the drag-driven add/nest path) and then assert
 * against the rendered canvas DOM. Mirrors the Phase-C canvas harness.
 */
function renderCanvasBuilder(): {
  get: () => { editor: EditorApi; dnd: CanvasDndApi }
} {
  const bag: { editor: EditorApi | null; dnd: CanvasDndApi | null } = {
    editor: null,
    dnd: null,
  }

  const DndProbe = (): null => {
    const dnd = useCanvasDnd()
    useEffect(() => {
      bag.dnd = dnd
    })
    return null
  }

  const Harness = (): ReactNode => {
    const editor = useEditor()
    useEffect(() => {
      bag.editor = editor
    })
    return (
      <EditorProvider value={editor}>
        <DndProbe />
        <Canvas />
        <FieldPropertiesPanel />
      </EditorProvider>
    )
  }

  render(<Harness />)
  return {
    get: () => ({ editor: defined(bag.editor), dnd: defined(bag.dnd) }),
  }
}

describe("EndpointBuilder rendered-UI integration (canvas)", () => {
  beforeEach(() => {
    // Each test starts from empty persistence so the fresh default seeds.
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  describe("authoring on the canvas — Req 1.5 parity", () => {
    it("adds a field of every type via a palette drop onto the canvas", () => {
      const { get } = renderCanvasBuilder()
      const types: EditorFieldType[] = [
        "String",
        "Integer",
        "Float",
        "Boolean",
        "Date",
        "DateTime",
        "Object",
        "Array",
      ]

      for (const type of types) {
        act(() =>
          get().dnd.onDragEnd(
            dropEvent(paletteActive(type), {
              kind: "container-zone",
              containerId: null,
            })
          )
        )
      }

      // One canvas node per dropped type, each carrying the dropped type.
      expect(get().editor.state.fields.map((f) => f.type)).toStrictEqual(types)
      // The canvas rendered a "Field type" control per node.
      expect(screen.getAllByLabelText("Field type")).toHaveLength(types.length)
    })

    it("nests a field two levels deep, into an Array-of-Object container", () => {
      const { get } = renderCanvasBuilder()

      // Level 1: drop an Object at the top level.
      act(() =>
        get().dnd.onDragEnd(
          dropEvent(paletteActive("Object"), {
            kind: "container-zone",
            containerId: null,
          })
        )
      )
      const objectId = defined(get().editor.state.fields[0]).id

      // Level 2: drop an Array into that Object, then make its items Object so
      // the Array itself becomes a field-holding container (Array-of-Object).
      act(() =>
        get().dnd.onDragEnd(
          dropEvent(paletteActive("Array"), {
            kind: "container-zone",
            containerId: objectId,
          })
        )
      )
      // The Array lives at objectField.fields[0] → path [0, 0].
      act(() => get().editor.changeArrayItemType([0, 0], "Object"))
      const [arrayField] = defined(defined(get().editor.state.fields[0]).fields)
      expect(defined(arrayField).type).toBe("Array")
      expect(defined(arrayField).items?.type).toBe("Object")
      const arrayId = defined(arrayField).id

      // Level 3: drop a String into the Array-of-Object's item fields, through
      // the real canvas drop handler (findContainerPath resolves the Array's
      // item fields from its id).
      act(() =>
        get().dnd.onDragEnd(
          dropEvent(paletteActive("String"), {
            kind: "container-zone",
            containerId: arrayId,
          })
        )
      )

      // The String landed inside the Array-of-Object's item fields — two
      // container levels below the top (top → Object → Array-of-Object).
      const nestedArray = defined(
        defined(defined(get().editor.state.fields[0]).fields)[0]
      )
      const itemFields = defined(nestedArray.items?.fields)
      expect(itemFields).toHaveLength(1)
      expect(defined(itemFields[0]).type).toBe("String")

      // The three named nodes (Object, Array, nested String) each render a
      // "Field name" input on the canvas.
      expect(screen.getAllByLabelText("Field name")).toHaveLength(3)
    })

    it("selects a node (drives the panel) and removes it from the canvas", async () => {
      const user = userEvent.setup()
      const { get } = renderCanvasBuilder()

      act(() =>
        get().dnd.onDragEnd(
          dropEvent(paletteActive("String"), {
            kind: "container-zone",
            containerId: null,
          })
        )
      )
      act(() =>
        get().dnd.onDragEnd(
          dropEvent(paletteActive("Integer"), {
            kind: "container-zone",
            containerId: null,
          })
        )
      )
      expect(fieldNameValues()).toHaveLength(2)

      // A palette drop auto-selects the dropped node; clear the selection so
      // the panel shows its hint, proving selection genuinely drives it.
      act(() => get().editor.selectField(null))
      expect(
        screen.getByText(/Select a field to edit its options/u)
      ).toBeDefined()

      // Selecting a node (focusing its name input) drives the properties panel
      // from its hint to the per-field option controls.
      const firstName = defined(screen.getAllByLabelText("Field name")[0])
      await user.click(firstName)
      expect(
        screen.queryByText(/Select a field to edit its options/u)
      ).toBeNull()
      expect(screen.getByText("Validations")).toBeDefined()

      // Removing a node drops it from the canvas.
      const removeButtons = screen.getAllByLabelText("Remove field")
      await user.click(defined(removeButtons[0]))
      expect(fieldNameValues()).toHaveLength(1)
    })
  })

  describe("import into the rendered builder (Req 9.1, 9.3)", () => {
    it("populates the canvas, metadata, and mutation from a valid file", async () => {
      const user = userEvent.setup()
      render(<EndpointBuilder />)

      await user.upload(fileInput(), jsonFile(JSON.stringify(validDefinition)))

      // Metadata is populated.
      await waitFor(() => {
        expect(
          (screen.getByLabelText("Table name") as HTMLInputElement).value
        ).toBe("events")
      })
      expect((screen.getByLabelText("Catalog") as HTMLInputElement).value).toBe(
        "main"
      )

      // The canvas is populated — the top-level names and the nested "city".
      expect(fieldNameValues()).toContain("id")
      expect(fieldNameValues()).toContain("profile")
      expect(fieldNameValues()).toContain("city")

      // Mutation was enabled from the file.
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
        "true"
      )
    })

    it("rejects a malformed file, shows errors, and leaves state untouched (no partial apply)", async () => {
      const user = userEvent.setup()
      render(<EndpointBuilder />)

      // First import a valid file so there is real state to protect.
      await user.upload(fileInput(), jsonFile(JSON.stringify(validDefinition)))
      await waitFor(() => {
        expect(
          (screen.getByLabelText("Table name") as HTMLInputElement).value
        ).toBe("events")
      })

      // Then import a broken file.
      await user.upload(fileInput(), jsonFile("{ not valid json "))

      // The error surfaces...
      await waitFor(() => {
        expect(screen.getByText("Import failed")).toBeDefined()
      })
      // ...and the previously imported state is intact (no partial apply).
      expect(
        (screen.getByLabelText("Table name") as HTMLInputElement).value
      ).toBe("events")
      expect(fieldNameValues()).toContain("profile")
    })
  })

  describe("export button gating (Req 8.1, 8.2)", () => {
    it("is blocked while the definition is invalid and unblocked once it is valid", async () => {
      const user = userEvent.setup()
      render(<EndpointBuilder />)

      // Make the definition invalid: a table name with a leading digit
      // violates the metadata pattern, so the gate blocks export.
      const tableName = screen.getByLabelText("Table name") as HTMLInputElement
      await user.clear(tableName)
      await user.type(tableName, "1bad")

      await waitFor(() => {
        const button = screen.getByRole("button", {
          name: EXPORT_NAME,
        }) as HTMLButtonElement
        expect(button.disabled).toBeTruthy()
      })

      // Importing a valid file replaces the invalid state and unblocks export.
      await user.upload(fileInput(), jsonFile(JSON.stringify(validDefinition)))

      await waitFor(() => {
        const button = screen.getByRole("button", {
          name: EXPORT_NAME,
        }) as HTMLButtonElement
        expect(button.disabled).toBeFalsy()
      })
    })
  })

  describe("type-change confirmation dialog (Req 3.10)", () => {
    it("appears on a lossy transition and applies only on confirm", async () => {
      const user = userEvent.setup()
      render(<EndpointBuilder />)

      // Import a definition with a populated Object so a change is lossy.
      await user.upload(fileInput(), jsonFile(JSON.stringify(validDefinition)))
      await waitFor(() => {
        expect(
          (screen.getByLabelText("Table name") as HTMLInputElement).value
        ).toBe("events")
      })

      // The "profile" node is the Object with a child; find its type select by
      // matching the index of the "profile" name input on the canvas.
      const profileIndex = fieldNameValues().indexOf("profile")
      expect(profileIndex).toBeGreaterThanOrEqual(0)

      // Change Object -> String: a lossy transition (drops the child field).
      await selectOption(user, typeSelectAt(profileIndex), "String")

      // The confirmation dialog appears and names what is lost.
      const dialog = await screen.findByRole("alertdialog")
      expect(within(dialog).getByText("Discard structural data?")).toBeDefined()

      // Decline first: the field stays an Object (its "city" child survives).
      await user.click(
        within(dialog).getByRole("button", { name: "Keep field" })
      )
      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).toBeNull()
      })
      expect(fieldNameValues()).toContain("city")

      // Trigger the lossy change again and confirm this time.
      await selectOption(user, typeSelectAt(profileIndex), "String")
      const dialog2 = await screen.findByRole("alertdialog")
      await user.click(
        within(dialog2).getByRole("button", { name: "Discard and change" })
      )

      // The child is gone -> the change applied on confirm.
      await waitFor(() => {
        expect(fieldNameValues()).not.toContain("city")
      })
    })
  })
})
