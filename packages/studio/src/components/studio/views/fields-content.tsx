import { CanvasSurface } from "../canvas/canvas"
import { FieldPropertiesPanel } from "../field-properties-panel"
import { FieldsEmptyState } from "../fields-extras"
import { UndoRedoControls } from "../undo-redo-controls"
import { useEditorContext } from "../use-editor"

/**
 * The Fields view's main content: the empty state (only while there are no
 * fields), the drag-and-drop canvas, and the field properties panel —
 * co-located so the palette (secondary sidebar) and the canvas are visible
 * together under the one hoisted `DndContext` (Req 3.1, 3.4, 7.1).
 */
export const FieldsContent = () => {
  const editor = useEditorContext()
  const empty = editor.state.fields.length === 0

  return (
    <div className="grid gap-4">
      {/* Content-fixed toolbar: the Undo/Redo buttons pinned to the top of the
          Fields content so they stay reachable while the field list scrolls.
          Scoped to the Fields view (Req 3.1, 3.3); the keyboard shortcut is
          global via `useUndoRedoShortcuts` at the shell root. */}
      <div className="bg-background sticky top-0 z-10 -mx-4 -mt-4 flex items-center border-b px-4 py-2">
        <UndoRedoControls />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-3">
          {empty && <FieldsEmptyState />}
          <CanvasSurface />
        </div>

        <aside
          aria-label="Field properties"
          className="border-border/60 h-fit rounded-md border p-3"
        >
          <h2 className="mb-3 text-sm font-medium">Properties</h2>
          <FieldPropertiesPanel />
        </aside>
      </div>
    </div>
  )
}
