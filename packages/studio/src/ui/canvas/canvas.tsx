import { DndContext, useDroppable } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"

import { cn } from "@/lib/utils"

import { TypeChangeConfirmDialog } from "../type-change-dialog"
import { useEditorContext } from "../use-editor"
import { CanvasNode } from "./canvas-node"
import { ROOT_ZONE_ID } from "./dnd-types"
import { DropIndicator } from "./drop-indicator"
import { Palette } from "./palette"
import {
  CanvasDndProvider,
  useCanvasDnd,
  useCanvasDndContext,
  useCanvasSensors,
} from "./use-canvas-dnd"
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
  const typeChange = useTypeChangeContext()
  const { confirm: handleTypeChangeConfirm, cancel: handleTypeChangeCancel } =
    typeChange
  const { fields } = editor.state
  const { setNodeRef, isOver } = useDroppable({
    id: ROOT_ZONE_ID,
    data: { kind: "container-zone", containerId: null },
  })

  const appendingTop =
    drag !== null &&
    drag.target !== null &&
    drag.target.containerId === null &&
    drag.target.beforeId === null

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Fields</h2>
      </div>

      {rejectionReason !== null && (
        <p role="alert" className="text-destructive text-xs">
          {rejectionReason}
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
        {appendingTop && <DropIndicator valid={drag?.plan?.ok ?? false} />}
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
  const typeChange = useCanvasTypeChange()
  const sensors = useCanvasSensors()
  const { onDragStart: handleDragStart } = dnd
  const { onDragOver: handleDragOver } = dnd
  const { onDragEnd: handleDragEnd } = dnd

  return (
    <CanvasDndProvider value={dnd}>
      <TypeChangeProvider value={typeChange}>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid gap-4">
            <Palette />
            <CanvasSurface />
          </div>
        </DndContext>
      </TypeChangeProvider>
    </CanvasDndProvider>
  )
}
