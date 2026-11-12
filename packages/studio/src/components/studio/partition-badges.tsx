import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "cn"
import { XIcon } from "lucide-react"

import type { PartitionSegment } from "./partition-format"
import { serializePartitionSegments } from "./partition-format"

/** A stable, order-independent id for a segment, used as its sortable key. */
function segmentId(segment: PartitionSegment): string {
  return segment.component === undefined
    ? segment.field
    : `${segment.field}:${segment.component}`
}

/** The human-readable label shown on a badge. */
function segmentLabel(segment: PartitionSegment): string {
  return segment.component === undefined
    ? segment.field
    : `${segment.field} → ${segment.component}`
}

/**
 * A single sortable, removable partition badge.
 *
 * Drag moves the badge via the pointer sensor; the dedicated remove button is
 * operable with Enter/Space. The whole badge is the sortable handle so keyboard
 * reordering (Space/Enter to pick up, arrow keys to move) works on the badge
 * itself.
 */
const PartitionBadge = ({
  segment,
  onRemove,
}: {
  segment: PartitionSegment
  onRemove: () => void
}) => {
  const id = segmentId(segment)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-input bg-accent/40 py-0.5 pr-0.5 pl-2 text-xs",
        isDragging && "opacity-50"
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${segmentLabel(segment)}`}
        className="focus-visible:ring-ring/50 cursor-grab rounded-sm font-mono outline-none focus-visible:ring-3"
        {...attributes}
        {...listeners}
      >
        {segmentLabel(segment)}
      </button>
      <button
        type="button"
        aria-label={`Remove ${segmentLabel(segment)}`}
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-4 items-center justify-center rounded-sm outline-none focus-visible:ring-3"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  )
}

/**
 * A horizontal, sortable row of removable partition badges, rendered in
 * `/`-segment order.
 *
 * Reordering or removing a badge produces the new ordered segment list and the
 * re-serialized `/`-separated partitioning string, handed to {@link onChange}
 * so the caller can commit it.
 *
 * The row owns its own scoped `DndContext` registering both a `PointerSensor`
 * and a `KeyboardSensor` (with `sortableKeyboardCoordinates`) — a new,
 * package-first keyboard-reorder pattern (the canvas registers only a
 * `PointerSensor`). Space/Enter picks a badge up, arrow keys reorder it, and
 * each badge's remove button is operable with Enter/Space, so the control is
 * fully keyboard-accessible.
 *
 * @param segments - The ordered chosen segments.
 * @param onChange - Called with the next segments and their serialized string.
 */
export const PartitionBadges = ({
  segments,
  onChange,
}: {
  segments: PartitionSegment[]
  onChange: (next: PartitionSegment[], serialized: string) => void
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const ids = segments.map(segmentId)

  const commit = (next: PartitionSegment[]): void => {
    onChange(next, serializePartitionSegments(next))
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (over === null || active.id === over.id) {
      return
    }
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) {
      return
    }
    const next = [...segments]
    const [moved] = next.splice(from, 1)
    if (moved === undefined) {
      return
    }
    next.splice(to, 0, moved)
    commit(next)
  }

  const handleRemove = (index: number): void => {
    commit(segments.filter((_, position) => position !== index))
  }

  if (segments.length === 0) {
    return null
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Chosen partition segments"
        >
          {segments.map((segment, index) => (
            <PartitionBadge
              key={segmentId(segment)}
              segment={segment}
              onRemove={() => handleRemove(index)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
