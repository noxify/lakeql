import { useId } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { metadataFieldError } from "./field-meta"
import { useEditorContext } from "./use-editor"

/**
 * The three metadata keys validated against `metadataFieldPattern`.
 */
type MetadataKey = "tableName" | "catalog" | "schema"

const METADATA_FIELDS: { key: MetadataKey; label: string }[] = [
  { key: "tableName", label: "Table name" },
  { key: "catalog", label: "Catalog" },
  { key: "schema", label: "Schema" },
]

/**
 * A single controlled metadata input with an inline, control-associated error.
 */
const MetadataField = ({
  fieldKey,
  label,
}: {
  fieldKey: MetadataKey
  label: string
}) => {
  const editor = useEditorContext()
  const id = useId()
  const errorId = `${id}-error`
  const value = editor.state[fieldKey]
  const error = metadataFieldError(value)

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : errorId}
        placeholder={label}
        onChange={(event) => {
          editor.replaceState({
            ...editor.state,
            [fieldKey]: event.target.value,
          })
        }}
        onBlur={() => editor.commitEdits()}
      />
      {error !== undefined && (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The endpoint metadata form: `tableName`/`catalog`/`schema` (pattern-validated
 * with inline errors), a free-text `dataSource`, and a read-only `version`
 * pinned to the schema literal `"1.0"`.
 *
 * All edits flow through the shared editor as continuous edits (coalesced into
 * a single history snapshot on blur). Invalid metadata shows inline here and
 * blocks export through the core validity gate — this component does not
 * reimplement the gate.
 */
export const MetadataForm = () => {
  const editor = useEditorContext()
  const dataSourceId = useId()
  const versionId = useId()

  return (
    <div className="grid gap-4">
      {METADATA_FIELDS.map(({ key, label }) => (
        <MetadataField key={key} fieldKey={key} label={label} />
      ))}

      <div className="grid gap-1.5">
        <Label htmlFor={dataSourceId}>Data source</Label>
        <Input
          id={dataSourceId}
          value={editor.state.dataSource}
          placeholder="Optional — omitted from export when empty"
          onChange={(event) => {
            editor.replaceState({
              ...editor.state,
              dataSource: event.target.value,
            })
          }}
          onBlur={() => editor.commitEdits()}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={versionId}>Version</Label>
        <Input id={versionId} value={editor.state.version} readOnly disabled />
        <p className="text-muted-foreground text-xs">
          Fixed by the schema; not editable.
        </p>
      </div>
    </div>
  )
}
