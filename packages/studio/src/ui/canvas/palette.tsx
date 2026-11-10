import { useDraggable } from "@dnd-kit/core"
import { GripVerticalIcon } from "lucide-react"

import type { EditorFieldType } from "@/core"
import { cn } from "@/lib/utils"

import { fieldTypeOptions } from "../field-meta"
import type { NewFieldDragData } from "./dnd-types"
import { paletteDraggableId } from "./dnd-types"

/**
 * One draggable palette source: a styled card that, when dragged onto the
 * canvas, creates a new field of its type. Carries a `new-field` drag payload.
 */
const PaletteSource = ({ fieldType }: { fieldType: EditorFieldType }) => {
  const data: NewFieldDragData = { kind: "new-field", fieldType }
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: paletteDraggableId(fieldType),
    data,
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`Add ${fieldType} field`}
      className={cn(
        "border-border bg-card text-card-foreground hover:border-ring flex w-full cursor-grab items-center gap-2 rounded-md border px-3 py-2 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        isDragging && "opacity-50"
      )}
      {...attributes}
      {...listeners}
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
