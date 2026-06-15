"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { METADATA_PATTERN } from "@/lib/endpoint-types"
import { cn } from "@/lib/utils"

interface MetadataFormProps {
  tableName: string
  catalog: string
  schema: string
  onChange: (key: "tableName" | "catalog" | "schema", value: string) => void
}

function validate(value: string): string | null {
  if (!value) {
    return "Required"
  }
  if (!METADATA_PATTERN.test(value)) {
    return "Must start with a letter or underscore, alphanumeric + underscore only, max 128 chars"
  }
  return null
}

function MetadataField({
  label,
  id,
  value,
  placeholder,
  onChange,
}: {
  label: string
  id: string
  value: string
  placeholder: string
  onChange: (v: string) => void
}) {
  const error = validate(value)
  const touched = value.length > 0

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "font-mono text-sm",
          touched &&
            error &&
            "border-destructive focus-visible:ring-destructive"
        )}
        aria-invalid={!!(touched && error)}
      />
      {touched && error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}

export function MetadataForm({
  tableName,
  catalog,
  schema,
  onChange,
}: MetadataFormProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetadataField
          label="Table Name"
          id="tableName"
          value={tableName}
          placeholder="user_events"
          onChange={(v) => onChange("tableName", v)}
        />
        <MetadataField
          label="Catalog"
          id="catalog"
          value={catalog}
          placeholder="analytics"
          onChange={(v) => onChange("catalog", v)}
        />
        <MetadataField
          label="Schema"
          id="schema"
          value={schema}
          placeholder="tracking"
          onChange={(v) => onChange("schema", v)}
        />
      </div>
    </div>
  )
}
