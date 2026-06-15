// oxlint-disable import/no-cycle
// oxlint-disable eslint/complexity
"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ALL_TYPES,
  ARRAY_ITEM_TYPES,
  FIELD_NAME_PATTERN,
  FIELD_TYPE_COLORS,
  MAX_DEPTH,
} from "@/lib/endpoint-types"
import type {
  FieldDefinition,
  FieldType,
  ArrayItemType,
} from "@/lib/endpoint-types"
import { generateId, getDuplicateNames } from "@/lib/endpoint-utils"
import { cn } from "@/lib/utils"

import { FieldList } from "./field-list"

interface FieldRowProps {
  field: FieldDefinition
  depth: number
  siblingNames: string[]
  onUpdate: (updated: FieldDefinition) => void
  onDelete: () => void
}

export function FieldRow({
  field,
  depth,
  siblingNames,
  onUpdate,
  onDelete,
}: FieldRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: field.id,
  })
  const [expanded, setExpanded] = useState(true)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const nameError = getNameError(field.name, siblingNames)
  const atMaxDepth = depth >= MAX_DEPTH

  function handleTypeChange(type: FieldType) {
    const updated: FieldDefinition = { ...field, type }
    if (type === "Object") {
      updated.fields ??= []
      delete updated.arrayItemType
      delete updated.arrayItemFields
    } else if (type === "Array") {
      updated.arrayItemType ??= "String"
      if (updated.arrayItemType === "Object") {
        updated.arrayItemFields ??= []
      }
      delete updated.fields
    } else {
      delete updated.fields
      delete updated.arrayItemType
      delete updated.arrayItemFields
    }
    onUpdate(updated)
  }

  function handleArrayItemTypeChange(itemType: ArrayItemType) {
    const updated: FieldDefinition = { ...field, arrayItemType: itemType }
    if (itemType === "Object") {
      updated.arrayItemFields ??= []
    } else {
      delete updated.arrayItemFields
    }
    onUpdate(updated)
  }

  function handleChildUpdate(index: number, updated: FieldDefinition) {
    const fields = [...(field.fields ?? [])]
    fields[index] = updated
    onUpdate({ ...field, fields })
  }

  function handleChildDelete(index: number) {
    const fields = [...(field.fields ?? [])]
    fields.splice(index, 1)
    onUpdate({ ...field, fields })
  }

  function handleArrayChildUpdate(index: number, updated: FieldDefinition) {
    const fields = [...(field.arrayItemFields ?? [])]
    fields[index] = updated
    onUpdate({ ...field, arrayItemFields: fields })
  }

  function handleArrayChildDelete(index: number) {
    const fields = [...(field.arrayItemFields ?? [])]
    fields.splice(index, 1)
    onUpdate({ ...field, arrayItemFields: fields })
  }

  function addChildField(target: "fields" | "arrayItemFields") {
    const newField: FieldDefinition = {
      id: generateId(),
      name: "",
      type: "String",
    }
    const current =
      target === "fields" ? (field.fields ?? []) : (field.arrayItemFields ?? [])
    onUpdate({ ...field, [target]: [...current, newField] })
  }

  const hasChildren =
    field.type === "Object" ||
    (field.type === "Array" && field.arrayItemType === "Object")
  const objectChildDupes = getDuplicateNames(field.fields ?? [])
  const arrayChildDupes = getDuplicateNames(field.arrayItemFields ?? [])

  // Types available depend on depth
  const availableTypes = atMaxDepth
    ? ALL_TYPES.filter((t) => t !== "Object" && t !== "Array")
    : ALL_TYPES

  const availableArrayItemTypes = atMaxDepth
    ? ARRAY_ITEM_TYPES.filter((t) => t !== "Object")
    : ARRAY_ITEM_TYPES

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border border-border bg-card transition-opacity",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      {/* Row header */}
      <div className="flex items-center gap-2 p-3">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>

        {/* Expand/collapse for nested */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        ) : (
          <div className="size-4" />
        )}

        {/* Field name */}
        <div className="flex flex-1 flex-col gap-1">
          <Input
            value={field.name}
            onChange={(e) => onUpdate({ ...field, name: e.target.value })}
            placeholder="field_name"
            className={cn(
              "h-8 font-mono text-sm",
              field.name &&
                nameError &&
                "border-destructive focus-visible:ring-destructive"
            )}
            aria-invalid={!!(field.name && nameError)}
          />
          {field.name && nameError && (
            <p className="text-destructive text-xs">{nameError}</p>
          )}
        </div>

        {/* Type dropdown */}
        <Select
          value={field.type}
          onValueChange={(v) => handleTypeChange(v as FieldType)}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {availableTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      FIELD_TYPE_COLORS[t]
                    )}
                  >
                    {t}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Type badge */}
        {/* <Badge
          className={cn(
            "hidden shrink-0 text-xs sm:flex",
            FIELD_TYPE_COLORS[field.type]
          )}
        >
          {field.type}
        </Badge> */}

        {/* Delete */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive size-8 shrink-0"
          aria-label="Delete field"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {/* Array item type selector */}
      {field.type === "Array" && (
        <div className="border-border bg-muted/30 flex items-center gap-2 border-t px-3 py-2">
          <span className="text-muted-foreground shrink-0 text-xs font-medium">
            Items type:
          </span>
          <Select
            value={field.arrayItemType ?? "String"}
            onValueChange={(v) => handleArrayItemTypeChange(v as ArrayItemType)}
          >
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="Item type" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {availableArrayItemTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium",
                        FIELD_TYPE_COLORS[t as FieldType]
                      )}
                    >
                      {t}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Nested children */}
      {hasChildren && expanded && (
        <div
          className={cn(
            "border-t border-border",
            depth % 2 === 0 ? "bg-muted/20" : "bg-background"
          )}
        >
          <div className="p-3">
            {/* Depth indicator */}
            <div className="mb-2 flex items-center gap-1.5">
              <div className="bg-border h-px flex-1" />
              <span className="text-muted-foreground font-mono text-xs">
                {field.type === "Object"
                  ? `${field.name || "Object"} fields`
                  : `${field.arrayItemType === "Object" ? "items.fields" : ""}`}
              </span>
              <div className="bg-border h-px flex-1" />
            </div>

            {/* Object children */}
            {field.type === "Object" && (
              <>
                <FieldList
                  fields={field.fields ?? []}
                  depth={depth + 1}
                  dupeNames={objectChildDupes}
                  onUpdate={handleChildUpdate}
                  onDelete={handleChildDelete}
                  onReorder={(fields) => onUpdate({ ...field, fields })}
                />
                {(field.fields ?? []).length === 0 && (
                  <p className="text-muted-foreground mb-2 text-xs italic">
                    Object must have at least 1 field
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addChildField("fields")}
                  className="mt-1 h-7 text-xs"
                >
                  <Plus className="size-3" data-icon="inline-start" />
                  Add field
                </Button>
              </>
            )}

            {/* Array object children */}
            {field.type === "Array" && field.arrayItemType === "Object" && (
              <>
                <FieldList
                  fields={field.arrayItemFields ?? []}
                  depth={depth + 1}
                  dupeNames={arrayChildDupes}
                  onUpdate={handleArrayChildUpdate}
                  onDelete={handleArrayChildDelete}
                  onReorder={(fields) =>
                    onUpdate({ ...field, arrayItemFields: fields })
                  }
                />
                {(field.arrayItemFields ?? []).length === 0 && (
                  <p className="text-muted-foreground mb-2 text-xs italic">
                    Object must have at least 1 field
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addChildField("arrayItemFields")}
                  className="mt-1 h-7 text-xs"
                >
                  <Plus className="size-3" data-icon="inline-start" />
                  Add field
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function getNameError(name: string, siblingNames: string[]): string | null {
  if (!name) {
    return null
  }
  if (!FIELD_NAME_PATTERN.test(name)) {
    return "Must start with a letter or underscore, alphanumeric + underscore only, max 64 chars"
  }
  if (siblingNames.filter((n) => n === name).length > 1) {
    return "Duplicate field name at this level"
  }
  return null
}
