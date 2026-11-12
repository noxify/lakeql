import type { LoadStrategy } from "@lakeql/schema-generator/endpoint-schema"
import {
  loadStrategies,
  partitioningFormats,
} from "@lakeql/schema-generator/endpoint-schema"
import { useId } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioCardGroup, RadioCardItem } from "@/components/ui/radio-card-group"
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

import { metadataInputId } from "./metadata-nav"
import {
  hasLoadTimestampCollision,
  partitioningValueForMode,
} from "./partition-format"
import { PartitioningFieldPicker } from "./partitioning-field-picker"
import { useEditorContext } from "./use-editor"
import type { PartitioningMode } from "./validation-meta"
import { offersPartitioningFormat, partitioningModeOf } from "./validation-meta"

/**
 * The effective-default enabled mutation config, prefilled so the controls have
 * concrete values to show. A freshly-enabled mutation now starts in `off`
 * partitioning mode (`partitioning: false`): nothing is imposed on the author,
 * and because `false !== DEFAULT_PARTITIONING` the export serializes
 * `partitioning: false` explicitly. `partitioningFormat` is still prefilled
 * with the runtime default so the granularity control has a value if the author
 * switches to timestamp mode.
 */
function defaultEnabledMutation(): Extract<EditorMutation, { enabled: true }> {
  return {
    enabled: true,
    loadStrategy: "append",
    basePath: "",
    partitioning: false,
    partitioningFormat: DEFAULT_PARTITIONING_FORMAT,
  }
}

const LOAD_STRATEGY_LABELS: Record<LoadStrategy, string> = {
  full_load: "Full load",
  full_load_append: "Full load append",
  append: "Append",
}

const TIMESTAMP_COLLISION_REASON =
  "A field named load_timestamp already exists; remove or rename it to use timestamp partitioning."

/**
 * The partitioning sub-form: a rich radio-card choice of mode (off / by write
 * timestamp / by field), the multi-field {@link PartitioningFieldPicker} in
 * field mode, and the granularity select when a non-custom, enabled mode is
 * active.
 *
 * The `timestamp` card is disabled when a real top-level `load_timestamp` field
 * already exists, so export never produces a duplicate-name error. Mode→value
 * mapping routes through {@link partitioningValueForMode}; {@link
 * partitioningModeOf} is the reverse.
 */
const PartitioningControls = ({
  mutation,
}: {
  mutation: Extract<EditorMutation, { enabled: true }>
}) => {
  const editor = useEditorContext()
  const mode = partitioningModeOf(mutation.partitioning)
  const collision = hasLoadTimestampCollision(editor.state.fields)

  const setMode = (next: PartitioningMode): void => {
    editor.setMutation({
      ...mutation,
      partitioning: partitioningValueForMode(next, mutation.partitioning),
    })
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Partitioning</span>
        <RadioCardGroup
          aria-label="Partitioning mode"
          value={mode}
          onValueChange={(next) => setMode(next as PartitioningMode)}
        >
          <RadioCardItem
            value="off"
            title="Off (flat layout)"
            description="No partitioning (flat layout)."
          />
          <RadioCardItem
            value="timestamp"
            disabled={collision}
            title="By write timestamp"
            description={
              collision
                ? TIMESTAMP_COLLISION_REASON
                : "Adds a managed load_timestamp DateTime field automatically; the CLI/runtime fills its value."
            }
          />
          <RadioCardItem
            value="field"
            title="By field / custom format"
            description="Choose fields (and date components) to build a custom partition path."
          />
        </RadioCardGroup>
      </div>

      {mode === "field" && <PartitioningFieldPicker mutation={mutation} />}

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
  // A stable, deterministic id so the Validations jump can target the base path
  // input (it exists only while mutation is enabled, which is also the only
  // state in which a basePath issue can arise).
  const basePathId = metadataInputId("basePath")
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
