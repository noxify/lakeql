import type {
  FieldOptions,
  FieldValidation,
} from "@lakeql/schema-generator/endpoint-schema"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { EditorField, FieldPath } from "@/core"
import { findFieldPath } from "@/core"

import { useEditorContext } from "./use-editor"
import type { ValidationKind } from "./validation-meta"
import {
  createValidation,
  validationError,
  validationKindLabels,
  validationKindsForType,
} from "./validation-meta"

/**
 * Normalizes the `options` of a field for editing: always returns an object the
 * panel can read, even when the field has no options yet.
 */
function readOptions(field: EditorField): FieldOptions {
  return field.options ?? {}
}

/**
 * Collapses an options object back to `undefined` when nothing meaningful is
 * set, so the mapping layer omits the `options` key on export and the live
 * state stays minimal.
 */
function normalizeOptions(options: FieldOptions): FieldOptions | undefined {
  const hasRequired = options.required === true
  const hasReadOnly = options.readOnly === true
  const hasValidations =
    options.validations !== undefined && options.validations.length > 0
  if (!hasRequired && !hasReadOnly && !hasValidations) {
    return undefined
  }
  const next: FieldOptions = {}
  if (hasRequired) {
    next.required = true
  }
  if (hasReadOnly) {
    next.readOnly = true
  }
  if (hasValidations) {
    next.validations = options.validations
  }
  return next
}

/**
 * One editable validation row: its kind label, the value input for
 * `min`/`max`/`regex`, an inline error, and a remove button.
 */
const ValidationRow = ({
  validation,
  onChange,
  onRemove,
}: {
  validation: FieldValidation
  onChange: (next: FieldValidation) => void
  onRemove: () => void
}) => {
  const valueId = useId()
  const errorId = `${valueId}-error`
  const error = validationError(validation)

  return (
    <div className="grid gap-1 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <span className="min-w-14 text-sm font-medium">
          {validationKindLabels[validation.type]}
        </span>

        {(validation.type === "min" || validation.type === "max") && (
          <Input
            id={valueId}
            type="number"
            className="h-8"
            aria-label={`${validationKindLabels[validation.type]} value`}
            aria-invalid={error !== undefined}
            aria-describedby={error === undefined ? undefined : errorId}
            value={Number.isNaN(validation.value) ? "" : validation.value}
            onChange={(event) => {
              onChange({
                type: validation.type,
                value:
                  event.target.value === ""
                    ? Number.NaN
                    : Number(event.target.value),
              })
            }}
          />
        )}

        {validation.type === "regex" && (
          <Input
            id={valueId}
            className="h-8 font-mono"
            placeholder="^[a-z]+$"
            aria-label="Regex pattern"
            aria-invalid={error !== undefined}
            aria-describedby={error === undefined ? undefined : errorId}
            value={validation.pattern}
            onChange={(event) => {
              onChange({ type: "regex", pattern: event.target.value })
            }}
          />
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove validation"
          className="ml-auto"
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>

      {error !== undefined && (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The per-field validations editor (task 13): lists the field's refinements,
 * each editable and removable, with an "add" picker restricted to the kinds
 * valid for the field's type.
 *
 * Every change is written back through the editor's `setFieldOptions`, so the
 * validity gate re-evaluates — an unconstructible `regex` surfaces both inline
 * here and as a blocking field error.
 */
const ValidationsEditor = ({
  field,
  path,
}: {
  field: EditorField
  path: FieldPath
}) => {
  const editor = useEditorContext()
  const addId = useId()
  const validations = field.options?.validations ?? []
  const available = validationKindsForType(field.type)

  const writeValidations = (next: FieldValidation[]): void => {
    const options = readOptions(field)
    editor.setFieldOptions(
      path,
      normalizeOptions({
        ...options,
        validations: next,
      })
    )
  }

  const addValidation = (kind: ValidationKind): void => {
    writeValidations([...validations, createValidation(kind)])
  }

  const updateValidation = (index: number, next: FieldValidation): void => {
    writeValidations(validations.map((v, i) => (i === index ? next : v)))
  }

  const removeValidation = (index: number): void => {
    writeValidations(validations.filter((_, i) => i !== index))
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={addId}>Validations</Label>
      </div>

      {validations.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {available.length === 0
            ? `No validations apply to a ${field.type} field.`
            : "No validations yet."}
        </p>
      ) : (
        <div className="grid gap-2">
          {validations.map((validation, index) => (
            <ValidationRow
              // Index-keyed: refinements are an ordered list with no stable id.
              key={index}
              validation={validation}
              onChange={(next) => updateValidation(index, next)}
              onRemove={() => removeValidation(index)}
            />
          ))}
        </div>
      )}

      {available.length > 0 && (
        <Select
          value=""
          onValueChange={(kind) => addValidation(kind as ValidationKind)}
        >
          <SelectTrigger id={addId} size="sm" className="w-full">
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              <PlusIcon className="size-4" />
              <SelectValue placeholder="Add validation" />
            </span>
          </SelectTrigger>
          <SelectContent>
            {available.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {validationKindLabels[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

/**
 * A labeled option toggle (`required` / `readOnly`).
 */
const OptionToggle = ({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}) => {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-muted-foreground text-xs">{description}</span>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next)}
      />
    </div>
  )
}

/**
 * The field properties panel (task 13), targeting the selected field: the
 * `required`/`readOnly` toggles and the validations editor.
 *
 * Options and validations are edited through the editor's `setFieldOptions`
 * (core single-source rule) and feed the validity gate directly. Only controls
 * valid for the field's type are shown. When no field is selected, or the
 * selection no longer resolves (for example after a remove), a hint is shown
 * instead.
 */
export const FieldPropertiesPanel = () => {
  const editor = useEditorContext()
  const selectedId = editor.selectedFieldId

  const path =
    selectedId === null
      ? undefined
      : findFieldPath(editor.state.fields, selectedId)

  if (selectedId === null || path === undefined) {
    return (
      <p className="text-muted-foreground p-1 text-sm">
        Select a field to edit its options and validations.
      </p>
    )
  }

  // `path` resolved, so the field exists.
  const field = resolveField(editor.state.fields, path)
  if (field === undefined) {
    return (
      <p className="text-muted-foreground p-1 text-sm">
        Select a field to edit its options and validations.
      </p>
    )
  }

  const options = readOptions(field)

  const setOption = (key: "required" | "readOnly", value: boolean): void => {
    editor.setFieldOptions(path, normalizeOptions({ ...options, [key]: value }))
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-0.5">
        <h3 className="text-sm font-medium">
          {field.name === "" ? "(unnamed field)" : field.name}
        </h3>
        <span className="text-muted-foreground text-xs">
          Type: {field.type}
        </span>
      </div>

      <div className="grid gap-3">
        <OptionToggle
          label="Required"
          description="Required in the mutation input."
          checked={options.required === true}
          onChange={(next) => setOption("required", next)}
        />
        <OptionToggle
          label="Read-only"
          description="Excluded from the mutation input type."
          checked={options.readOnly === true}
          onChange={(next) => setOption("readOnly", next)}
        />
      </div>

      <ValidationsEditor field={field} path={path} />
    </div>
  )
}

/**
 * Resolves the field at `path` for rendering. Mirrors the core descent
 * (`Object.fields` / `Array`-of-`Object` `items.fields`) read-only.
 */
function resolveField(
  fields: EditorField[],
  path: FieldPath
): EditorField | undefined {
  let current: EditorField | undefined
  let container: EditorField[] | undefined = fields
  for (const index of path) {
    if (container === undefined) {
      return undefined
    }
    current = container[index]
    if (current === undefined) {
      return undefined
    }
    container =
      current.type === "Object"
        ? current.fields
        : current.type === "Array" && current.items?.type === "Object"
          ? current.items.fields
          : undefined
  }
  return current
}
