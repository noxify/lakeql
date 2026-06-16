"use client"

import { X } from "lucide-react"
import { useMemo, useState } from "react"

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
import type {
  FieldDefinition,
  LoadStrategy,
  MutationConfig,
  PartitioningComponent,
  PartitioningFormat,
  StorageType,
} from "@/lib/endpoint-types"
import {
  LOAD_STRATEGIES,
  PARTITIONING_COMPONENTS,
  PARTITIONING_FORMATS,
} from "@/lib/endpoint-types"

interface MutationFormProps {
  mutation: false | MutationConfig | undefined
  onChange: (mutation: false | MutationConfig | undefined) => void
  /** Current field definitions — used to populate the partition field selector */
  fields?: FieldDefinition[]
}

const STRATEGY_LABELS: Record<LoadStrategy, string> = {
  full_load: "Full Load",
  full_load_append: "Full Load + Append",
  append: "Append",
}

const STORAGE_TYPE_LABELS: Record<StorageType, string> = {
  s3: "S3",
  minio: "MinIO",
}

const STORAGE_TYPES: StorageType[] = ["s3", "minio"]

type PartitioningMode = "timestamp" | "disabled" | "custom"

function getPartitioningMode(mutation: MutationConfig): PartitioningMode {
  if (mutation.partitioning === false) {
    return "disabled"
  }
  if (mutation.partitioning === true || mutation.partitioning === undefined) {
    return "timestamp"
  }
  // Any string value (including empty) = custom mode
  return "custom"
}

/** Parse a custom partitioning string into individual segments */
function parseSegments(value: string): string[] {
  if (!value) {
    return []
  }
  return value.split("/").filter((s) => s.length > 0)
}

/** Serialize segments back to a format string */
function serializeSegments(segments: string[]): string {
  return segments.join("/")
}

/** Date/DateTime types that require a component picker */
const DATE_TYPES = new Set(["Date", "DateTime"])

const EMPTY_FIELDS: FieldDefinition[] = []

export function MutationForm({
  mutation,
  onChange,
  fields = EMPTY_FIELDS,
}: MutationFormProps) {
  const enabled = mutation !== undefined && mutation !== false

  const [pendingDateField, setPendingDateField] = useState<string | null>(null)

  /** Collect partitionable fields (String, Integer, Date, DateTime) */
  const partitionableFields = useMemo(() => {
    const result: FieldDefinition[] = []
    for (const f of fields) {
      if (
        f.name.trim() &&
        (f.type === "String" ||
          f.type === "Integer" ||
          f.type === "Date" ||
          f.type === "DateTime")
      ) {
        result.push(f)
      }
    }
    return result
  }, [fields])

  function handleToggle(checked: boolean) {
    if (checked) {
      onChange({
        loadStrategy: "full_load",
        type: "s3",
        bucket: "",
        basePath: "",
      })
    } else {
      // oxlint-disable-next-line unicorn/no-useless-undefined
      onChange(undefined)
    }
  }

  function handleStrategyChange(value: LoadStrategy | null) {
    if (enabled && value) {
      onChange({ ...mutation, loadStrategy: value })
    }
  }

  function handleTypeChange(value: StorageType | null) {
    if (enabled && value) {
      onChange({ ...mutation, type: value })
    }
  }

  function handleBucketChange(value: string) {
    if (enabled) {
      onChange({ ...mutation, bucket: value })
    }
  }

  function handleBasePathChange(value: string) {
    if (enabled) {
      onChange({ ...mutation, basePath: value })
    }
  }

  function handleEndpointChange(value: string) {
    if (enabled) {
      onChange({ ...mutation, endpoint: value || undefined })
    }
  }

  function handlePartitioningModeChange(mode: PartitioningMode) {
    if (!enabled) {
      return
    }
    setPendingDateField(null)
    switch (mode) {
      case "timestamp": {
        onChange({
          ...mutation,
          partitioning: true,
          partitioningFormat: mutation.partitioningFormat ?? "year/month/day",
        })
        break
      }
      case "disabled": {
        onChange({
          ...mutation,
          partitioning: false,
          partitioningFormat: undefined,
        })
        break
      }
      case "custom": {
        onChange({
          ...mutation,
          partitioning: "",
          partitioningFormat: undefined,
        })
        break
      }
      default: {
        break
      }
    }
  }

  function handlePartitioningFormatChange(value: PartitioningFormat) {
    if (enabled) {
      onChange({ ...mutation, partitioningFormat: value })
    }
  }

  // --- Custom partition tag-input handlers ---

  function addSegment(segment: string) {
    if (!enabled) {
      return
    }
    const current =
      typeof mutation.partitioning === "string" ? mutation.partitioning : ""
    const segments = parseSegments(current)
    segments.push(segment)
    onChange({ ...mutation, partitioning: serializeSegments(segments) })
  }

  function removeSegment(index: number) {
    if (!enabled) {
      return
    }
    const current =
      typeof mutation.partitioning === "string" ? mutation.partitioning : ""
    const segments = parseSegments(current)
    segments.splice(index, 1)
    onChange({ ...mutation, partitioning: serializeSegments(segments) })
  }

  function handleAddFieldSelect(fieldName: string | null) {
    if (!fieldName) {
      return
    }
    const field = partitionableFields.find((f) => f.name === fieldName)
    if (!field) {
      return
    }

    if (DATE_TYPES.has(field.type)) {
      setPendingDateField(fieldName)
    } else {
      addSegment(fieldName)
    }
  }

  function handleDateComponentSelect(component: PartitioningComponent) {
    if (!pendingDateField) {
      return
    }
    addSegment(`${pendingDateField}:${component}`)
    setPendingDateField(null)
  }

  const showPartitioning = enabled && mutation.loadStrategy !== "full_load"
  const partitioningMode = enabled ? getPartitioningMode(mutation) : "timestamp"
  const customSegments =
    enabled && typeof mutation.partitioning === "string"
      ? parseSegments(mutation.partitioning)
      : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Switch
          id="mutation-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
        />
        <Label htmlFor="mutation-toggle" className="text-sm font-medium">
          Enable Mutation
        </Label>
      </div>

      {enabled && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="storage-type" className="text-sm font-medium">
              Storage Type
            </Label>
            <Select
              value={mutation.type ?? "s3"}
              onValueChange={handleTypeChange}
            >
              <SelectTrigger id="storage-type" className="w-full">
                <SelectValue placeholder="Select storage type" />
              </SelectTrigger>
              <SelectContent>
                {STORAGE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {STORAGE_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="load-strategy" className="text-sm font-medium">
              Load Strategy
            </Label>
            <Select
              value={mutation.loadStrategy}
              onValueChange={handleStrategyChange}
            >
              <SelectTrigger id="load-strategy" className="w-full">
                <SelectValue placeholder="Select strategy" />
              </SelectTrigger>
              <SelectContent>
                {LOAD_STRATEGIES.map((strategy) => (
                  <SelectItem key={strategy} value={strategy}>
                    {STRATEGY_LABELS[strategy]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bucket" className="text-sm font-medium">
              Bucket
            </Label>
            <Input
              id="bucket"
              value={mutation.bucket}
              onChange={(e) => handleBucketChange(e.target.value)}
              placeholder="my-datalake"
              className="font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="base-path" className="text-sm font-medium">
              Base Path
            </Label>
            <Input
              id="base-path"
              value={mutation.basePath}
              onChange={(e) => handleBasePathChange(e.target.value)}
              placeholder="warehouse/analytics/events"
              className="font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endpoint" className="text-sm font-medium">
              Endpoint
              {mutation.type === "minio" ? " (required)" : " (optional)"}
            </Label>
            <Input
              id="endpoint"
              value={mutation.endpoint ?? ""}
              onChange={(e) => handleEndpointChange(e.target.value)}
              placeholder={
                mutation.type === "minio"
                  ? "http://minio:9000"
                  : "https://s3.amazonaws.com"
              }
              className="font-mono text-sm"
            />
          </div>

          {showPartitioning && (
            <>
              <div className="border-border/40 col-span-full border-t pt-3" />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="partitioning" className="text-sm font-medium">
                  Partitioning
                </Label>
                <Select
                  value={partitioningMode}
                  onValueChange={(v) =>
                    handlePartitioningModeChange(v as PartitioningMode)
                  }
                >
                  <SelectTrigger id="partitioning" className="w-full">
                    <SelectValue placeholder="Select partitioning mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="timestamp">
                      Timestamp (default)
                    </SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {partitioningMode === "timestamp" && (
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="partitioning-format"
                    className="text-sm font-medium"
                  >
                    Partition Format
                  </Label>
                  <Select
                    value={mutation.partitioningFormat ?? "year/month/day"}
                    onValueChange={(v) =>
                      handlePartitioningFormatChange(v as PartitioningFormat)
                    }
                  >
                    <SelectTrigger id="partitioning-format" className="w-full">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      {PARTITIONING_FORMATS.map((format) => (
                        <SelectItem key={format} value={format}>
                          {format}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {partitioningMode === "custom" && (
                <div className="col-span-full flex flex-col gap-2">
                  <Label className="text-sm font-medium">
                    Partition Segments
                  </Label>

                  {/* Tag-input container */}
                  <div className="border-input flex min-h-8 flex-wrap gap-1.5 rounded-lg border bg-transparent px-2.5 py-1.5">
                    {customSegments.map((segment, index) => (
                      <span
                        key={`${segment}-${index}`}
                        className="bg-muted flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-xs"
                      >
                        {segment}
                        <button
                          type="button"
                          onClick={() => removeSegment(index)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {customSegments.length === 0 && (
                      <span className="text-muted-foreground text-xs">
                        No segments added yet
                      </span>
                    )}
                  </div>

                  {/* Add segment dropdown */}
                  <div className="flex items-center gap-2">
                    <Select value="" onValueChange={handleAddFieldSelect}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Add segment..." />
                      </SelectTrigger>
                      <SelectContent>
                        {partitionableFields.length === 0 && (
                          <SelectItem value="__none__" disabled>
                            No fields available
                          </SelectItem>
                        )}
                        {partitionableFields.map((field) => (
                          <SelectItem
                            key={field.id}
                            value={field.name}
                            className="font-mono"
                          >
                            {field.name}{" "}
                            <span className="text-muted-foreground ml-1 text-xs">
                              ({field.type})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Date component picker (shown when a Date/DateTime field is selected) */}
                    {pendingDateField && (
                      <Select
                        value=""
                        onValueChange={(v) =>
                          handleDateComponentSelect(v as PartitioningComponent)
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue
                            placeholder={`${pendingDateField}: component`}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {PARTITIONING_COMPONENTS.map((component) => (
                            <SelectItem key={component} value={component}>
                              {component}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Preview of resulting format string */}
                  {customSegments.length > 0 && (
                    <p className="text-muted-foreground font-mono text-xs">
                      Result: &quot;{serializeSegments(customSegments)}&quot;
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
