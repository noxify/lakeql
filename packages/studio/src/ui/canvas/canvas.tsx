import { DndContext, useDroppable } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"

import { cn } from "@/lib/utils"

import { TypeChangeConfirmDialog } from "../type-change-dialog"
import { useEditorContext } from "../use-editor"
import { CanvasNode } from "./canvas-node"
import { ROOT_ZONE_ID } from "./dnd-types"
import { DropIndicator } from "./drop-indicator"
import { indicatorAt } from "./indicator-state"
import { Palette } from "./palette"
import {
  CanvasDndProvider,
  useCanvasDnd,
  useCanvasDndContext,
  useCanvasSensors,
} from "./use-canvas-dnd"
import {
  KeyboardMoveProvider,
  useKeyboardMove,
  useKeyboardMoveContext,
} from "./use-keyboard-move"
import {
  TypeChangeProvider,
  useCanvasTypeChange,
  useTypeChangeContext,
} from "./use-type-change"

/**
 * The top-level droppable surface rendering the editor's `fields` as sortable
 * canvas nodes. An append indicator shows at the end while a drag resolves to
 * appending at the top level; the rejection reason surfaces a
 * structurally-impossible drop.
 */
const CanvasSurface = () => {
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
          <p className="text-muted-foreground text-sm">
            No fields yet. Drag a type from the palette to add one. A top-level
            definition with no fields is valid.
          </p>
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
 * A visually hidden `aria-live` region announcing keyboard structural actions
 * (pick up, target change, drop, cancel, palette add) reusing the Iteration-1
 * announcer pattern (Requirement 5.4). Polite so it does not interrupt the user
 * mid-navigation; atomic so each new message is read in full.
 */
const KeyboardMoveAnnouncer = () => {
  const keyboard = useKeyboardMoveContext()
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="keyboard-move-announcer"
    >
      {keyboard.announcement}
    </div>
  )
}

/**
 * The drag-and-drop authoring canvas (Requirement 1.1 center region). A single
 * `DndContext` wraps the palette and the recursive node surface; every
 * structural change routes through the `use-editor` commit path (`addField` for
 * a palette source, `moveField` for a node), so the canvas is a pure
 * presentation layer over `@/core`.
 *
 * The palette renders inline above the surface so a single `DndContext` spans
 * both the draggable sources and their drop targets.
 */
export const Canvas = () => {
  const dnd = useCanvasDnd()
  const keyboard = useKeyboardMove()
  const typeChange = useCanvasTypeChange()
  const sensors = useCanvasSensors()
  const { onDragStart: handleDragStart } = dnd
  const { onDragOver: handleDragOver } = dnd
  const { onDragEnd: handleDragEnd } = dnd

  return (
    <CanvasDndProvider value={dnd}>
      <KeyboardMoveProvider value={keyboard}>
        <TypeChangeProvider value={typeChange}>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid gap-4">
              <KeyboardMoveAnnouncer />
              <Palette />
              <CanvasSurface />
            </div>
          </DndContext>
        </TypeChangeProvider>
      </KeyboardMoveProvider>
    </CanvasDndProvider>
  )
}
