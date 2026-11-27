import { useDroppable } from "@dnd-kit/core"
import { SortableContext, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "cn"
import {
  CircleAlertIcon,
  GripVerticalIcon,
  MousePointerClickIcon,
  Trash2Icon,
} from "lucide-react"
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

import {
  arrayItemTypeOptions,
  fieldNameError,
  fieldTypeOptions,
} from "../field-meta"
import { useEditorContext } from "../use-editor"
import { fieldIdsWithIssues } from "../validation-readable"
import type { NodeAnchorData } from "./dnd-types"
import { containerChildren, isDropContainer, zoneId } from "./dnd-types"
import { DropIndicator } from "./drop-indicator"
import { indicatorAt } from "./indicator-state"
import { useCanvasDndContext } from "./use-canvas-dnd"
import { useFieldFocusContext } from "./use-field-focus"
import { useFieldRemovalContext } from "./use-field-removal"
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

  // The append indicator shows when a pointer drag resolves to appending into
  // this container (its zone is the target, no node anchor before which to
  // insert).
  const appendIndicator = indicatorAt(drag, field.id, null)

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
      {appendIndicator.show && <DropIndicator valid={appendIndicator.valid} />}
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
 * integration tests target the same controls. The card is a labelled
 * `role="group"` region, not a button, so its interactive children (name
 * input, type selects, remove button, grip) are not nested under a button
 * role. Selection targets the field so the properties panel can edit it: the
 * card exposes a dedicated `"Select field"` control — a focusable button with
 * an `aria-pressed` state and a visible focus ring, operable by pointer and
 * keyboard — as a clear select affordance scoped to the card, in addition to
 * the name-input focus path. Making the whole card a single selectable control
 * would nest its interactive children under a button role, so the select
 * target is kept scoped to this dedicated control instead. Drag stays on the
 * grip handle, so selecting never starts a drag. A lossy type change routes
 * through the single shared confirmation dialog and is applied only on confirm.
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
  const fieldFocus = useFieldFocusContext()
  const typeChange = useTypeChangeContext()
  const fieldRemoval = useFieldRemovalContext()
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
    setActivatorNodeRef,
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

  // Derived live from the current validity-gate result: the node carries an
  // issue indicator whenever any diagnostic keys to its id, and it clears the
  // instant the gate no longer reports one (Req 4.1, 4.2).
  const hasIssue = fieldIdsWithIssues(editor.validation).has(field.id)

  // Show the "insert before this node" indicator when the live pointer drag
  // resolves to dropping before this field.
  const indicator = indicatorAt(drag, containerId, field.id)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Selecting a field drives the properties panel.
  const selectField = (): void => {
    editor.selectField(field.id)
  }

  return (
    <div>
      {indicator.show && <DropIndicator valid={indicator.valid} />}
      <div
        ref={setNodeRef}
        style={style}
        role="group"
        aria-label={field.name === "" ? "Unnamed field" : field.name}
        className={cn(
          "border-border bg-card text-card-foreground rounded-md border p-2",
          selected && "border-ring bg-accent/40",
          isDragging && "opacity-50"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Reorder field"
            // Pointer-only drag handle (no keyboard reordering by design; no
            // `KeyboardSensor` is registered). `setActivatorNodeRef` registers
            // this as the sortable's activator, and `tabIndex={-1}` keeps the
            // keyboard-inert handle out of the Tab order.
            ref={setActivatorNodeRef}
            className="text-muted-foreground focus-visible:ring-ring/50 cursor-grab rounded-sm outline-none focus-visible:ring-3"
            {...attributes}
            {...listeners}
            // Spread last so it wins over `attributes.tabIndex` (0).
            tabIndex={-1}
          >
            <GripVerticalIcon className="size-4" />
          </button>

          <button
            type="button"
            aria-label="Select field"
            aria-pressed={selected}
            className="text-muted-foreground focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-3"
            onClick={(event) => {
              // The card's select affordance: a sibling of the other controls,
              // never their ancestor, so the card carries no button role over
              // its interactive children. Keyboard- and pointer-operable with a
              // visible focus ring; stopPropagation keeps a nested card's
              // selection from bubbling up to re-select its ancestor container.
              event.stopPropagation()
              selectField()
            }}
          >
            <MousePointerClickIcon className="size-4" />
          </button>

          {hasIssue && (
            <span
              role="img"
              aria-label="has validation issue"
              title="This field has a validation issue"
              className="text-destructive inline-flex shrink-0 items-center"
            >
              <CircleAlertIcon className="size-4" />
            </span>
          )}

          <div className="grid min-w-40 flex-1 gap-1">
            <Input
              id={nameId}
              // Registered so a palette add or a Validations jump can move
              // focus straight into the field's name input.
              ref={(element) => fieldFocus.registerNodeRef(field.id, element)}
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
            onClick={() => fieldRemoval.requestRemove(path)}
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
