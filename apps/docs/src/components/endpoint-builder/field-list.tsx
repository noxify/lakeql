// oxlint-disable import/no-cycle
"use client"

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"

import type { FieldDefinition } from "@/lib/endpoint-types"

import { FieldRow } from "./field-row"

interface FieldListProps {
  fields: FieldDefinition[]
  depth: number
  dupeNames: Set<string>
  onUpdate: (index: number, updated: FieldDefinition) => void
  onDelete: (index: number) => void
  onReorder: (fields: FieldDefinition[]) => void
}

export function FieldList({
  fields,
  depth,
  dupeNames: _dupeNames,
  onUpdate,
  onDelete,
  onReorder,
}: FieldListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = fields.findIndex((f) => f.id === active.id)
    const newIndex = fields.findIndex((f) => f.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(arrayMove(fields, oldIndex, newIndex))
    }
  }

  const siblingNames = fields.map((f) => f.name)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext
        items={fields.map((f) => f.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <FieldRow
              key={field.id}
              field={field}
              depth={depth}
              siblingNames={siblingNames}
              onUpdate={(updated) => onUpdate(index, updated)}
              onDelete={() => onDelete(index)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
