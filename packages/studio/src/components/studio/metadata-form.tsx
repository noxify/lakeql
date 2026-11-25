import { useId } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EditorAdapterId } from "@/core"
import { adapterProfile, EDITOR_ADAPTERS } from "@/core"

import { metadataFieldError } from "./field-meta"
import { metadataInputId } from "./metadata-nav"
import { useEditorContext } from "./use-editor"
import { metadataKeysWithIssues } from "./validation-readable"

/**
 * The three metadata keys validated against `metadataFieldPattern`.
 */
type MetadataKey = "tableName" | "catalog" | "schema"

/**
 * Rendered after the adapter and data source, from the broadest coordinate to
 * the narrowest, because the adapter decides which of these are prefilled or
 * locked.
 */
const METADATA_FIELDS: { key: MetadataKey; label: string }[] = [
  { key: "catalog", label: "Catalog" },
  { key: "schema", label: "Schema" },
  { key: "tableName", label: "Table name" },
]

/**
 * A single controlled metadata input with an inline, control-associated error.
 *
 * The error state follows the validity gate: a value that violates the pattern
 * shows the rule, and an empty value shows "is required" as soon as the gate
 * reports it (it blocks export), so the control, the header count and the
 * Validations list always agree.
 */
const MetadataField = ({
  fieldKey,
  label,
}: {
  fieldKey: MetadataKey
  label: string
}) => {
  const editor = useEditorContext()
  // A stable, deterministic id so the Validations jump can target this input;
  // it also anchors the label's `htmlFor` and the error's `aria-describedby`.
  const id = metadataInputId(fieldKey)
  const errorId = `${id}-error`
  const value = editor.state[fieldKey]
  const gateFlagged = metadataKeysWithIssues(editor.validation).has(fieldKey)
  const error =
    metadataFieldError(value) ??
    (value === "" && gateFlagged ? `${label} is required.` : undefined)

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
 * The endpoint metadata form, ordered from source to table: the editor-only
 * adapter choice, a free-text `dataSource`, `catalog`/`schema`/`tableName`
 * (pattern-validated with inline errors), and a read-only `version` pinned to
 * the schema literal `"2.0"`.
 *
 * All edits flow through the shared editor as continuous edits (coalesced into
 * a single history snapshot on blur). Invalid metadata shows inline here and
 * blocks export through the core validity gate — this component does not
 * reimplement the gate.
 */
export const MetadataForm = () => {
  const editor = useEditorContext()
  // A stable, deterministic id so the Validations jump can target the data
  // source input; `version` has no navigable target so it keeps a `useId()`.
  const dataSourceId = metadataInputId("dataSource")
  const versionId = useId()
  const adapterId = useId()

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={adapterId}>Adapter</Label>
        <Select
          value={editor.adapter}
          onValueChange={(next) => editor.setAdapter(next as EditorAdapterId)}
        >
          <SelectTrigger id={adapterId} className="w-full" aria-label="Adapter">
            <SelectValue>
              {(value: EditorAdapterId) => adapterProfile(value).label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {EDITOR_ADAPTERS.map((profile) => (
              <SelectItem
                key={profile.id}
                value={profile.id}
                disabled={!profile.available}
              >
                {profile.label}
                {profile.unavailableHint !== undefined && (
                  <span className="text-muted-foreground self-center text-xs">
                    {profile.unavailableHint}
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Shapes the editor only. It is not part of the exported definition.
        </p>
      </div>

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

      {METADATA_FIELDS.map(({ key, label }) => (
        <MetadataField key={key} fieldKey={key} label={label} />
      ))}

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
