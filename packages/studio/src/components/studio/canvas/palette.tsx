import { useDraggable } from "@dnd-kit/core"
import { cn } from "cn"
import { GripVerticalIcon } from "lucide-react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"

import type { EditorFieldType } from "@/core"

import { fieldTypeOptions } from "../field-meta"
import type { NewFieldDragData } from "./dnd-types"
import { paletteDraggableId } from "./dnd-types"
import { useKeyboardMoveContext } from "./use-keyboard-move"

/**
 * One draggable palette source: a styled card that, when dragged onto the
 * canvas, creates a new field of its type. Carries a `new-field` drag payload.
 */
const PaletteSource = ({ fieldType }: { fieldType: EditorFieldType }) => {
  const data: NewFieldDragData = { kind: "new-field", fieldType }
  const keyboard = useKeyboardMoveContext()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: paletteDraggableId(fieldType),
    data,
  })

  // Activate-to-insert by keyboard: Enter/Space adds a field of this type into
  // the currently-selected container (Requirement 5.2). Declared after the
  // `@dnd-kit` listeners so it wins the `onKeyDown`, and it stops propagation so
  // the coordinate-based keyboard sensor does not also start a (useless) drag.
  const onKeyDown = (event: ReactKeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    keyboard.addFromPalette(fieldType)
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`Add ${fieldType} field`}
      className={cn(
        "border-border bg-card text-card-foreground hover:border-ring focus-visible:border-ring focus-visible:ring-ring/50 flex w-full cursor-grab items-center gap-2 rounded-md border px-3 py-2 text-left text-sm outline-none focus-visible:ring-3",
        isDragging && "opacity-50"
      )}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
    >
      <GripVerticalIcon className="text-muted-foreground size-4 shrink-0" />
      <span className="font-medium">{fieldType}</span>
    </button>
  )
}

/**
 * The left-region palette: one draggable source per field type (the six
 * primitives plus `Object` and `Array`). Dragging a source onto the canvas (or
 * into a container) adds a new field at the drop position via the `use-editor`
 * add path.
 */
export const Palette = () => (
  <div className="grid gap-2">
    <h2 className="text-sm font-medium">Field types</h2>
    <p className="text-muted-foreground text-xs">
      Drag a type onto the canvas to add a field.
    </p>
    <div className="grid gap-1.5">
      {fieldTypeOptions.map((fieldType) => (
        <PaletteSource key={fieldType} fieldType={fieldType} />
      ))}
    </div>
  </div>
)
