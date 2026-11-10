import { ChevronRightIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
  EditorState,
  FieldPath,
} from "@/core"
import { createField } from "@/core"
import { cn } from "@/lib/utils"

import {
  arrayItemTypeOptions,
  fieldNameError,
  fieldTypeOptions,
} from "./field-meta"
import { useEditorContext } from "./use-editor"

/**
 * Returns the child-field array a field exposes, or `undefined` for a field
 * that holds no structural children (a primitive, or an `Array` with a
 * primitive item). Mirrors the resolution the core uses, for rendering only.
 */
function childrenOf(field: EditorField): EditorField[] | undefined {
  if (field.type === "Object") {
    return field.fields ?? []
  }
  if (field.type === "Array" && field.items?.type === "Object") {
    return field.items.fields ?? []
  }
  return undefined
}

/**
 * Immutably renames the field addressed by `path`, returning a new state. A
 * name is valid for every field type, so this never touches structure and is
 * safe as a continuous (coalesced) edit.
 */
function renameAt(
  state: EditorState,
  path: FieldPath,
  name: string
): EditorState {
  const rename = (
    fields: EditorField[],
    segments: FieldPath
  ): EditorField[] => {
    const [index, ...rest] = segments
    return fields.map((field, i) => {
      if (i !== index) {
        return field
      }
      if (rest.length === 0) {
        return { ...field, name }
      }
      if (field.type === "Object") {
        return { ...field, fields: rename(field.fields ?? [], rest) }
      }
      if (field.type === "Array" && field.items?.type === "Object") {
        return {
          ...field,
          items: {
            ...field.items,
            fields: rename(field.items.fields ?? [], rest),
          },
        }
      }
      return field
    })
  }
  return { ...state, fields: rename(state.fields, path) }
}

/**
 * The button that adds a new field to a container, used both at the top level
 * and inside each `Object`/`Array`-of-`Object` node.
 */
const AddFieldButton = ({
  parentPath,
  label,
}: {
  parentPath: FieldPath
  label: string
}) => {
  const editor = useEditorContext()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => editor.addField(parentPath, createField())}
    >
      <PlusIcon />
      {label}
    </Button>
  )
}

/**
 * A `Select` over the eight field types (six primitives + `Object` + `Array`).
 */
const FieldTypeSelect = ({
  value,
  onChange,
  label,
}: {
  value: EditorFieldType
  onChange: (next: EditorFieldType) => void
  label: string
}) => (
  <Select
    value={value}
    onValueChange={(next) => onChange(next as EditorFieldType)}
  >
    <SelectTrigger size="sm" aria-label={label}>
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
 * A `Select` over the valid `Array` item types (primitives + `Object`, never
 * `Array`).
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
 * A single tree node: its name input, type picker, array-item picker (only for
 * `Array`), remove button, and — for `Object`/`Array`-of-`Object` — a
 * collapsible panel of child nodes with an add affordance.
 *
 * Add/remove/type operations route through the shared editor (and thence to
 * `@/core/field-ops`); the node never reimplements the transition logic. A
 * lossy type change is guarded: the core refuses it without `confirm` and the
 * node leaves the field unchanged, pending the task-16 confirmation dialog —
 * no structure is dropped silently.
 */
const FieldNode = ({
  field,
  path,
}: {
  field: EditorField
  path: FieldPath
}) => {
  const editor = useEditorContext()
  const [open, setOpen] = useState(true)
  const nameId = useId()
  const nameErrorId = `${nameId}-error`

  const children = childrenOf(field)
  const isContainer = children !== undefined
  const selected = editor.selectedFieldId === field.id
  const nameErr = fieldNameError(field.name)

  const row = (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-transparent px-2 py-1.5",
        selected && "border-ring bg-accent/40"
      )}
    >
      {isContainer ? (
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={open ? "Collapse" : "Expand"}
            />
          }
        >
          <ChevronRightIcon
            className={cn("transition-transform", open && "rotate-90")}
          />
        </CollapsibleTrigger>
      ) : (
        <span className="inline-block w-7" aria-hidden="true" />
      )}

      <div className="grid min-w-40 flex-1 gap-1">
        <Input
          id={nameId}
          value={field.name}
          placeholder="field_name"
          aria-label="Field name"
          aria-invalid={nameErr !== undefined}
          aria-describedby={nameErr === undefined ? undefined : nameErrorId}
          onFocus={() => editor.selectField(field.id)}
          onChange={(event) => {
            editor.replaceState(
              renameAt(editor.state, path, event.target.value)
            )
          }}
          onBlur={() => editor.commitEdits()}
        />
        {nameErr !== undefined && (
          <p id={nameErrorId} className="text-destructive text-xs">
            {nameErr}
          </p>
        )}
      </div>

      <FieldTypeSelect
        label="Field type"
        value={field.type}
        onChange={(next) => editor.changeFieldType(path, next)}
      />

      {field.type === "Array" && (
        <>
          <span className="text-muted-foreground text-xs">of</span>
          <ArrayItemTypeSelect
            value={field.items?.type ?? "String"}
            onChange={(next) => editor.changeArrayItemType(path, next)}
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
  )

  if (!isContainer) {
    return row
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {row}
      <CollapsibleContent>
        <div className="border-border/60 mt-1 ml-5 grid gap-1 border-l pl-3">
          {children.length === 0 ? (
            <p className="text-muted-foreground py-1 text-xs">
              No child fields yet. {field.type} requires at least one.
            </p>
          ) : (
            children.map((child, index) => (
              <FieldNode key={child.id} field={child} path={[...path, index]} />
            ))
          )}
          <div>
            <AddFieldButton parentPath={path} label="Add child field" />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * The recursive field tree. Renders the top-level `fields` with an add
 * affordance, each node carrying its own type picker, array-item picker, and
 * nested children. Selection is surfaced through the shared editor so the
 * (future, task-13) properties panel can target the active field.
 */
export const FieldTree = () => {
  const editor = useEditorContext()
  const { fields } = editor.state

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Fields</h2>
        <AddFieldButton parentPath={[]} label="Add field" />
      </div>

      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No fields yet. A top-level definition with no fields is valid; add
          fields to describe the structure.
        </p>
      ) : (
        <div className="grid gap-1">
          {fields.map((field, index) => (
            <FieldNode key={field.id} field={field} path={[index]} />
          ))}
        </div>
      )}
    </div>
  )
}
