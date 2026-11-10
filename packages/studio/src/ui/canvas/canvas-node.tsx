import { useDroppable } from "@dnd-kit/core"
import { SortableContext, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon, Trash2Icon } from "lucide-react"
import type { KeyboardEvent, MouseEvent } from "react"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  EditorArrayItemType,
  EditorField,
  EditorFieldType,
  FieldPath,
} from "@/core"
import { cn } from "@/lib/utils"

import {
  arrayItemTypeOptions,
  fieldNameError,
  fieldTypeOptions,
} from "../field-meta"
import { useEditorContext } from "../use-editor"
import type { NodeAnchorData } from "./dnd-types"
import { containerChildren, isDropContainer, zoneId } from "./dnd-types"
import { DropIndicator } from "./drop-indicator"
import { useCanvasDndContext } from "./use-canvas-dnd"
import { useTypeChangeContext } from "./use-type-change"

/**
 * A `Select` over the eight field types (six primitives + `Object` + `Array`),
 * reusing the Iteration-1 `"Field type"` label so the parity tests target the
 * same control.
 */
const FieldTypeSelect = ({
  value,
  onChange,
}: {
  value: EditorFieldType
  onChange: (next: EditorFieldType) => void
}) => (
  <Select
    value={value}
    onValueChange={(next) => onChange(next as EditorFieldType)}
  >
    <SelectTrigger size="sm" aria-label="Field type">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {fieldTypeOptions.map((type) => (
        <SelectItem key={type} value={type}>
          {type}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)

/**
 * A `Select` over the valid `Array` item types (primitives + `Object`), reusing
 * the Iteration-1 `"Array item type"` label.
 */
const ArrayItemTypeSelect = ({
  value,
  onChange,
}: {
  value: EditorArrayItemType
  onChange: (next: EditorArrayItemType) => void
}) => (
  <Select
    value={value}
    onValueChange={(next) => onChange(next as EditorArrayItemType)}
  >
    <SelectTrigger size="sm" aria-label="Array item type">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {arrayItemTypeOptions.map((type) => (
        <SelectItem key={type} value={type}>
          {type}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)

/**
 * The nested drop zone of a container node (`Object` or `Array`-of-`Object`):
 * a droppable region rendering its child nodes recursively, with an append
 * drop indicator at the end while a drag is over the empty area.
 */
const ContainerZone = ({
  field,
  path,
  fields,
}: {
  field: EditorField
  path: FieldPath
  fields: EditorField[]
}) => {
  const { drag } = useCanvasDndContext()
  const { setNodeRef, isOver } = useDroppable({
    id: zoneId(field.id),
    data: { kind: "container-zone", containerId: field.id },
  })

  // The append indicator shows when the hover resolves to appending into this
  // container (its zone is the target, no node anchor under the pointer).
  const appendingHere =
    drag !== null &&
    drag.target !== null &&
    drag.target.containerId === field.id &&
    drag.target.beforeId === null

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-border/60 mt-2 ml-5 grid gap-1 border-l pl-3",
        isOver && "border-ring"
      )}
    >
      {fields.length === 0 ? (
        <p className="text-muted-foreground py-1 text-xs">
          No child fields yet. {field.type} requires at least one.
        </p>
      ) : (
        <SortableContext items={fields.map((child) => child.id)}>
          {fields.map((child, index) => (
            <CanvasNode
              key={child.id}
              field={child}
              path={[...path, index]}
              containerId={field.id}
            />
          ))}
        </SortableContext>
      )}
      {appendingHere && <DropIndicator valid={drag?.plan?.ok ?? false} />}
    </div>
  )
}

/**
 * A single draggable/droppable field card, rendered recursively. Carries the
 * `move-field` drag payload (its stable id) and a `node-anchor` drop payload so
 * a drop before it resolves to a `beforeId`. `Object` and `Array`-of-`Object`
 * nodes render a nested {@link ContainerZone}; a primitive and an
 * `Array`-of-primitive expose no drop zone.
 *
 * The node reuses the Iteration-1 `aria-label`s (`"Field name"`,
 * `"Field type"`, `"Array item type"`, `"Remove field"`) so the Phase-D
 * integration tests target the same controls. The whole card is selectable —
 * a pointer click or a keyboard `Enter`/`Space` on the focused card selects the
 * field so the properties panel targets it (in addition to focusing the name
 * input), while drag stays on the grip handle so selecting never starts a drag.
 * A lossy type change routes through the single shared confirmation dialog and
 * is applied only on confirm.
 */
export const CanvasNode = ({
  field,
  path,
  containerId,
}: {
  field: EditorField
  path: FieldPath
  containerId: string | null
}) => {
  const editor = useEditorContext()
  const { drag } = useCanvasDndContext()
  const typeChange = useTypeChangeContext()
  const nameId = useId()
  const nameErrorId = `${nameId}-error`

  const anchorData: NodeAnchorData = {
    kind: "node-anchor",
    fieldId: field.id,
    containerId,
  }
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id, data: anchorData })

  const requestFieldType = (nextType: EditorFieldType): void => {
    typeChange.requestFieldType(path, nextType)
  }

  const requestArrayItemType = (nextType: EditorArrayItemType): void => {
    typeChange.requestArrayItemType(path, nextType)
  }

  const selected = editor.selectedFieldId === field.id
  const nameErr = fieldNameError(field.name)
  const children = containerChildren(field)

  // Show the "insert before this node" indicator when the live drag resolves
  // to dropping before this field.
  const indicatingBefore =
    drag !== null &&
    drag.target !== null &&
    drag.target.containerId === containerId &&
    drag.target.beforeId === field.id

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Selecting the card drives the properties panel. The whole card is a select
  // target for pointer users; for keyboard users it is focusable and activates
  // on Enter/Space. Activation is handled only when the card itself is the
  // event target, so it never hijacks the keys of the inner controls (name
  // input, type selects, remove button, drag handle) that stop propagation of
  // their own activation. Drag stays on the grip handle, so a card click/key
  // never starts a drag.
  const selectField = (): void => {
    editor.selectField(field.id)
  }

  const onCardClick = (event: MouseEvent<HTMLDivElement>): void => {
    // Stop at the innermost card so a click on a nested child does not also
    // re-select its ancestor container through event bubbling.
    event.stopPropagation()
    selectField()
  }

  const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Only the focused card itself activates; keys from inner controls (name
    // input, selects, buttons) are left untouched.
    if (event.target !== event.currentTarget) {
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      event.stopPropagation()
      selectField()
    }
  }

  return (
    <div>
      {indicatingBefore && <DropIndicator valid={drag?.plan?.ok ?? false} />}
      <div
        ref={setNodeRef}
        style={style}
        role="button"
        tabIndex={0}
        aria-label={field.name === "" ? "Unnamed field" : field.name}
        aria-pressed={selected}
        onClick={onCardClick}
        onKeyDown={onCardKeyDown}
        className={cn(
          "border-border bg-card text-card-foreground focus-visible:ring-ring/50 cursor-pointer rounded-md border p-2 outline-none focus-visible:ring-3",
          selected && "border-ring bg-accent/40",
          isDragging && "opacity-50"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Reorder field"
            className="text-muted-foreground focus-visible:ring-ring/50 cursor-grab rounded-sm outline-none focus-visible:ring-3"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-4" />
          </button>

          <div className="grid min-w-40 flex-1 gap-1">
            <Input
              id={nameId}
              value={field.name}
              placeholder="field_name"
              aria-label="Field name"
              aria-invalid={nameErr !== undefined}
              aria-describedby={nameErr === undefined ? undefined : nameErrorId}
              onFocus={() => editor.selectField(field.id)}
              onChange={(event) => editor.renameField(path, event.target.value)}
              onBlur={() => editor.commitEdits()}
            />
            {nameErr !== undefined && (
              <p id={nameErrorId} className="text-destructive text-xs">
                {nameErr}
              </p>
            )}
          </div>

          <FieldTypeSelect value={field.type} onChange={requestFieldType} />

          {field.type === "Array" && (
            <>
              <span className="text-muted-foreground text-xs">of</span>
              <ArrayItemTypeSelect
                value={field.items?.type ?? "String"}
                onChange={requestArrayItemType}
              />
            </>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove field"
            onClick={() => editor.removeField(path)}
          >
            <Trash2Icon />
          </Button>
        </div>

        {isDropContainer(field) && children !== undefined && (
          <ContainerZone field={field} path={path} fields={children} />
        )}
      </div>
    </div>
  )
}
