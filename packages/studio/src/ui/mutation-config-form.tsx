import type { LoadStrategy } from "@lakeql/schema-generator/endpoint-schema"
import {
  loadStrategies,
  partitioningFormats,
  validatePartitioningFormat,
} from "@lakeql/schema-generator/endpoint-schema"
import { useId } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { EditorMutation } from "@/core"
import { DEFAULT_PARTITIONING_FORMAT } from "@/core"

import { useEditorContext } from "./use-editor"
import type { PartitioningMode } from "./validation-meta"
import { offersPartitioningFormat, partitioningModeOf } from "./validation-meta"

/**
 * The effective-default enabled mutation config, prefilled so the controls have
 * concrete values to show (Req 5.6). `partitioning: true` and
 * `partitioningFormat: "year/month/day"` are the documented runtime defaults;
 * the mapping layer omits them from the export when left at these values.
 */
function defaultEnabledMutation(): Extract<EditorMutation, { enabled: true }> {
  return {
    enabled: true,
    loadStrategy: "append",
    basePath: "",
    partitioning: true,
    partitioningFormat: DEFAULT_PARTITIONING_FORMAT,
  }
}

const LOAD_STRATEGY_LABELS: Record<LoadStrategy, string> = {
  full_load: "Full load",
  full_load_append: "Full load append",
  append: "Append",
}

const PARTITIONING_MODE_LABELS: Record<PartitioningMode, string> = {
  timestamp: "By write timestamp",
  off: "Off (flat layout)",
  field: "By field / custom format",
}

/**
 * The partitioning sub-form: a radio choice of mode, the field/custom string
 * input (with `validatePartitioningFormat` feedback) when in field mode, and
 * the granularity select when a non-custom, enabled mode is active.
 */
const PartitioningControls = ({
  mutation,
}: {
  mutation: Extract<EditorMutation, { enabled: true }>
}) => {
  const editor = useEditorContext()
  const stringId = useId()
  const stringErrorId = `${stringId}-error`
  const mode = partitioningModeOf(mutation.partitioning)

  const setMode = (next: PartitioningMode): void => {
    if (next === "timestamp") {
      editor.setMutation({ ...mutation, partitioning: true })
    } else if (next === "off") {
      editor.setMutation({ ...mutation, partitioning: false })
    } else {
      // Entering field mode: seed with an empty string the user then fills.
      editor.setMutation({
        ...mutation,
        partitioning:
          typeof mutation.partitioning === "string"
            ? mutation.partitioning
            : "",
      })
    }
  }

  const partitionString =
    typeof mutation.partitioning === "string" ? mutation.partitioning : ""
  const partitionError =
    mode === "field" && partitionString !== ""
      ? validatePartitioningFormat(partitionString)
      : null

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5" role="group" aria-label="Partitioning mode">
        <span className="text-sm font-medium">Partitioning</span>
        <RadioGroup
          value={mode}
          onValueChange={(next) => setMode(next as PartitioningMode)}
        >
          {(["timestamp", "off", "field"] as const).map((value) => {
            const itemId = `${stringId}-${value}`
            return (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem id={itemId} value={value} />
                <Label htmlFor={itemId} className="font-normal">
                  {PARTITIONING_MODE_LABELS[value]}
                </Label>
              </div>
            )
          })}
        </RadioGroup>
      </div>

      {mode === "field" && (
        <div className="grid gap-1.5">
          <Label htmlFor={stringId}>Partition format</Label>
          <Input
            id={stringId}
            className="font-mono"
            placeholder="created_at or year/month/created_at:day"
            aria-invalid={partitionError !== null}
            aria-describedby={
              partitionError === null ? undefined : stringErrorId
            }
            value={partitionString}
            onChange={(event) => {
              editor.setMutation(
                { ...mutation, partitioning: event.target.value },
                { commit: false }
              )
            }}
            onBlur={() => editor.commitEdits()}
          />
          {partitionError === null ? (
            <p className="text-muted-foreground text-xs">
              A field name, or a custom <code>fieldname:component</code> format
              with <code>/</code> separators.
            </p>
          ) : (
            <p id={stringErrorId} className="text-destructive text-xs">
              {partitionError}
            </p>
          )}
        </div>
      )}

      {offersPartitioningFormat(mutation.partitioning) && (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Partition granularity</span>
          <Select
            value={mutation.partitioningFormat}
            onValueChange={(next) => {
              editor.setMutation({
                ...mutation,
                partitioningFormat: String(next),
              })
            }}
          >
            <SelectTrigger
              className="w-full"
              aria-label="Partition granularity"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {partitioningFormats.map((format) => (
                <SelectItem key={format} value={format}>
                  {format}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

/**
 * The mutation configuration form (task 14).
 *
 * A switch enables or disables mutation — disabled exports `mutation: false`,
 * enabled exports a config object (Req 5.1). When enabled it exposes
 * `loadStrategy`, `basePath`, and the partitioning controls, with the effective
 * defaults prefilled so the JSON stays minimal and round-trip stable (the
 * mapping layer omits default partitioning values on export).
 *
 * All edits route through the editor's `setMutation` so the single source of
 * state stays in `@/core`; `basePath` and the partition string are continuous
 * edits settled on blur, everything else commits immediately.
 */
export const MutationConfigForm = () => {
  const editor = useEditorContext()
  const { mutation } = editor.state
  const loadStrategyId = useId()
  const basePathId = useId()
  const enabledId = useId()

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <Label htmlFor={enabledId}>Enable mutation</Label>
          <span className="text-muted-foreground text-xs">
            Off exports <code>mutation: false</code>.
          </span>
        </div>
        <Switch
          id={enabledId}
          checked={mutation.enabled}
          onCheckedChange={(next) => {
            editor.setMutation(
              next ? defaultEnabledMutation() : { enabled: false }
            )
          }}
        />
      </div>

      {mutation.enabled && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor={loadStrategyId}>Load strategy</Label>
            <Select
              value={mutation.loadStrategy}
              onValueChange={(next) => {
                editor.setMutation({
                  ...mutation,
                  loadStrategy: next as LoadStrategy,
                })
              }}
            >
              <SelectTrigger
                id={loadStrategyId}
                className="w-full"
                aria-label="Load strategy"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {loadStrategies.map((strategy) => (
                  <SelectItem key={strategy} value={strategy}>
                    {LOAD_STRATEGY_LABELS[strategy]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={basePathId}>Base path</Label>
            <Input
              id={basePathId}
              placeholder="/warehouse/events"
              aria-invalid={mutation.basePath === ""}
              value={mutation.basePath}
              onChange={(event) => {
                editor.setMutation(
                  { ...mutation, basePath: event.target.value },
                  { commit: false }
                )
              }}
              onBlur={() => editor.commitEdits()}
            />
            {mutation.basePath === "" && (
              <p className="text-destructive text-xs">
                A non-empty base path is required when mutation is enabled.
              </p>
            )}
          </div>

          <PartitioningControls mutation={mutation} />
        </>
      )}
    </div>
  )
}
