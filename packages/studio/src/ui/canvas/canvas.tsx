import { useDroppable } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"

import { cn } from "@/lib/utils"

import { TypeChangeConfirmDialog } from "../type-change-dialog"
import { useEditorContext } from "../use-editor"
import { CanvasNode } from "./canvas-node"
import { ROOT_ZONE_ID } from "./dnd-types"
import { DropIndicator } from "./drop-indicator"
import { indicatorAt } from "./indicator-state"
import { Palette } from "./palette"
import { CanvasShellRoot } from "./shell-root"
import { useCanvasDndContext } from "./use-canvas-dnd"
import { useKeyboardMoveContext } from "./use-keyboard-move"
import { useTypeChangeContext } from "./use-type-change"

/**
 * The top-level droppable surface rendering the editor's `fields` as sortable
 * canvas nodes. An append indicator shows at the end while a drag resolves to
 * appending at the top level; the rejection reason surfaces a
 * structurally-impossible drop.
 *
 * A separately-mountable piece of the decomposed canvas: it consumes the DnD,
 * keyboard-move, and type-change contexts from the hoisted `CanvasShellRoot`
 * rather than owning them, so it can render in the shell's main content while
 * the {@link Palette} renders in a different subtree under the same single
 * `DndContext`.
 */
export const CanvasSurface = () => {
  const editor = useEditorContext()
  const { drag, rejectionReason } = useCanvasDndContext()
  const keyboard = useKeyboardMoveContext()
  const typeChange = useTypeChangeContext()
  const { confirm: handleTypeChangeConfirm, cancel: handleTypeChangeCancel } =
    typeChange
  const { fields } = editor.state
  const { setNodeRef, isOver } = useDroppable({
    id: ROOT_ZONE_ID,
    data: { kind: "container-zone", containerId: null },
  })

  // The top-level append indicator, driven by whichever of the pointer drag or
  // the keyboard move resolves to appending at the top level.
  const appendTop = indicatorAt(drag, keyboard.move, null, null)

  // A structurally-impossible keyboard target surfaces its reason the same way
  // the pointer path does (shared `role="alert"` surface).
  const keyboardReason =
    keyboard.move !== null && !keyboard.move.plan.ok
      ? (keyboard.move.plan.reason ?? "This move is not possible.")
      : null
  const alertReason = keyboardReason ?? rejectionReason

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Fields</h2>
      </div>

      {alertReason !== null && (
        <p role="alert" className="text-destructive text-xs">
          {alertReason}
        </p>
      )}

      <div
        ref={setNodeRef}
        aria-label="Field canvas"
        className={cn(
          "border-border/60 min-h-24 rounded-md border border-dashed p-2",
          isOver && "border-ring"
        )}
      >
        {fields.length === 0 ? (
          // The empty-state guidance is the shell's single `role="note"`
          // `FieldsEmptyState` (Req 7.1); the surface renders only the bordered
          // drop target here so two empty-state messages never stack.
          <span className="sr-only">Canvas is empty.</span>
        ) : (
          <SortableContext items={fields.map((field) => field.id)}>
            <div className="grid gap-1">
              {fields.map((field, index) => (
                <CanvasNode
                  key={field.id}
                  field={field}
                  path={[index]}
                  containerId={null}
                />
              ))}
            </div>
          </SortableContext>
        )}
        {appendTop.show && <DropIndicator valid={appendTop.valid} />}
      </div>

      {/* One shared type-change confirmation dialog for the whole canvas,
          driven by the currently-pending lossy change (Req 3.10). */}
      <TypeChangeConfirmDialog
        pending={typeChange.pending}
        onConfirm={handleTypeChangeConfirm}
        onCancel={handleTypeChangeCancel}
      />
    </div>
  )
}

/**
 * The drag-and-drop authoring canvas (Requirement 1.1 center region): the
 * {@link Palette} and the {@link CanvasSurface} mounted together under a single
 * hoisted {@link CanvasShellRoot}.
 *
 * This is now a thin composition over the decomposed pieces — the providers and
 * `DndContext` live in `CanvasShellRoot`, and the palette and surface are
 * separately-mountable. It keeps a working authoring surface (palette above the
 * canvas) for the pre-shell layout; the iteration-3 shell instead mounts
 * `CanvasShellRoot` once and places `Palette` and `CanvasSurface` in its own
 * subtrees.
 */
export const Canvas = () => (
  <CanvasShellRoot>
    <div className="grid gap-4">
      <Palette />
      <CanvasSurface />
    </div>
  </CanvasShellRoot>
)
