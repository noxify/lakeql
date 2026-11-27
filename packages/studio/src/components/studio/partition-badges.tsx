import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "cn"
import { XIcon } from "lucide-react"

import type { EditorField, EditorPartitionSegment } from "@/core"
import { isResolvedPartitionSegment, partitionSegmentLabel } from "@/core"

import { partitionSegmentKey } from "./partition-format"

/**
 * Unique sortable ids for an ordered segment list: each segment's key, with a
 * `#n` suffix on repeats so duplicated (for example unresolved) segments stay
 * distinct while each id still follows its segment when reordered.
 */
function sortableIds(segments: EditorPartitionSegment[]): string[] {
  const seen = new Map<string, number>()
  return segments.map((segment) => {
    const key = partitionSegmentKey(segment)
    const count = seen.get(key) ?? 0
    seen.set(key, count + 1)
    return count === 0 ? key : `${key}#${count}`
  })
}

/**
 * A single sortable, removable partition badge.
 *
 * Drag moves the badge via the pointer sensor (reordering is pointer-only); the
 * dedicated remove button is operable with Enter/Space. The badge label is the
 * sortable handle and is kept out of the Tab order, since it has no keyboard
 * action.
 */
const PartitionBadge = ({
  id,
  segment,
  fields,
  onRemove,
}: {
  id: string
  segment: EditorPartitionSegment
  fields: EditorField[]
  onRemove: () => void
}) => {
  const label = partitionSegmentLabel(segment, fields)
  const unresolved = !isResolvedPartitionSegment(segment)
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
        isDragging && "opacity-50",
        unresolved && "border-destructive/60"
      )}
      title={unresolved ? "No single field with this name exists." : undefined}
    >
      <button
        type="button"
        aria-label={`Reorder ${label}`}
        className="focus-visible:ring-ring/50 cursor-grab rounded-sm font-mono outline-none focus-visible:ring-3"
        {...attributes}
        {...listeners}
        // Spread last so it wins over `attributes.tabIndex` (0): the handle has
        // no keyboard action, so it stays out of the Tab order.
        tabIndex={-1}
      >
        {label}
      </button>
      <button
        type="button"
        aria-label={`Remove ${label}`}
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
 * Reordering or removing a badge produces the new ordered segment list, handed
 * to {@link onChange} so the caller can commit it. Labels resolve the segments'
 * field ids against `fields`, so a renamed field shows its current name.
 *
 * The row owns its own scoped `DndContext` registering a `PointerSensor` only,
 * like the canvas. Each badge's remove button stays operable with Enter/Space.
 *
 * @param segments - The ordered chosen segments.
 * @param fields - The editor fields the segments' ids resolve against.
 * @param onChange - Called with the next ordered segments.
 */
export const PartitionBadges = ({
  segments,
  fields,
  onChange,
}: {
  segments: EditorPartitionSegment[]
  fields: EditorField[]
  onChange: (next: EditorPartitionSegment[]) => void
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  const ids = sortableIds(segments)

  const commit = (next: EditorPartitionSegment[]): void => {
    onChange(next)
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
              key={ids[index]}
              id={ids[index] as string}
              segment={segment}
              fields={fields}
              onRemove={() => handleRemove(index)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
