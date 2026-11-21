import type { LoadStrategy } from "@lakeql/schema-generator/endpoint-schema"
import {
  AUTO_FILL_NAME_MAX_LENGTH,
  loadStrategies,
  partitioningFormats,
} from "@lakeql/schema-generator/endpoint-schema"
import { ClockIcon } from "lucide-react"
import { useId } from "react"

import { Button } from "@/components/ui/button"
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
import { toast } from "@/components/ui/toast"
import type {
  EditorField,
  EditorMutation,
  EditorPartitionSegment,
} from "@/core"
import {
  addField as addFieldOp,
  createField,
  DEFAULT_PARTITIONING_FORMAT,
} from "@/core"

import { metadataInputId } from "./metadata-nav"
import { partitioningValueForMode } from "./partition-format"
import { PartitioningFieldPicker } from "./partitioning-field-picker"
import { useOptionalShellView } from "./shell-view"
import { useEditorContext } from "./use-editor"
import type { PartitioningMode } from "./validation-meta"
import { offersPartitioningFormat, partitioningModeOf } from "./validation-meta"

/**
 * The default name of the write-timestamp auto-fill field added by the helper
 * button. A short literal well within the {@link AUTO_FILL_NAME_MAX_LENGTH}
 * cap; sliced defensively so the default can never exceed the cap even if the
 * literal is lengthened later.
 */
const AUTO_FILL_DEFAULT_FIELD_NAME = "load_timestamp".slice(
  0,
  AUTO_FILL_NAME_MAX_LENGTH
)

/**
 * The effective-default enabled mutation config, prefilled so the controls have
 * concrete values to show. A freshly-enabled mutation starts in `off`
 * partitioning mode (`partitioning: false`): nothing is imposed on the author,
 * and the export always serializes an explicit `partitioning` value (C8).
 * `partitioningFormat` is still prefilled with the runtime default so the
 * granularity control has a value if the author switches to a legacy
 * single-field string.
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

/**
 * The partitioning sub-form: a two-mode radio-card choice (off / by field), the
 * multi-field {@link PartitioningFieldPicker} in field mode, and the
 * granularity select when a non-custom legacy single-field value is active.
 *
 * The write-timestamp mode is gone — a write-timestamp column is an explicit
 * auto-fill field (added via the helper button below), not a partitioning mode.
 * Mode→value mapping routes through {@link partitioningValueForMode}; {@link
 * partitioningModeOf} is the reverse.
 */
const PartitioningControls = ({
  mutation,
}: {
  mutation: Extract<EditorMutation, { enabled: true }>
}) => {
  const editor = useEditorContext()
  const mode = partitioningModeOf(mutation.partitioning)

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
 * The partition path a write-timestamp auto-fill field is prefilled with:
 * year, month, and day components of that field, bound to it by id so a later
 * rename keeps the path attached.
 *
 * @param fieldId - The auto-fill field's id.
 * @returns The ordered segments.
 */
function writeTimestampPartitioning(fieldId: string): EditorPartitionSegment[] {
  return [
    { fieldId, component: "year" },
    { fieldId, component: "month" },
    { fieldId, component: "day" },
  ]
}

/**
 * The write-timestamp auto-fill helper: a button that appends a real top-level
 * `DateTime` field carrying `options.autoFill: "write_timestamp"` with the
 * default name {@link AUTO_FILL_DEFAULT_FIELD_NAME}. Unlike the removed implicit
 * timestamp mode, this adds an ordinary, editable, persisted field to
 * `state.fields` (FR7.3) — the author can rename it, and the schema derives its
 * `_year`/`_month` companions.
 *
 * The button is disabled when a top-level field already uses the default name,
 * so a single click never introduces a duplicate-name collision. A successful
 * add confirms with a success toast; inside the studio shell the toast offers a
 * "Show field" action that opens the Fields view with the new field selected.
 *
 * When "By field / custom format" is active and no partition segments are
 * chosen yet (`partitioning` is an empty list), the click also prefills the partition
 * path with {@link writeTimestampPartitioning}. A partitioning that is off or
 * already has segments is never touched. Field and partitioning land in one
 * history snapshot, so a single undo reverts both.
 *
 * @param props.mutation - The enabled mutation whose partitioning may be
 *   prefilled.
 */
const AutoFillHelper = ({
  mutation,
}: {
  mutation: Extract<EditorMutation, { enabled: true }>
}) => {
  const editor = useEditorContext()
  const shell = useOptionalShellView()
  const existing = editor.state.fields.find(
    (field) => field.name === AUTO_FILL_DEFAULT_FIELD_NAME
  )
  const alreadyAdded = existing?.options?.autoFill === "write_timestamp"

  const addAutoFillField = (): void => {
    const base = createField("DateTime")
    const field: EditorField = {
      ...base,
      name: AUTO_FILL_DEFAULT_FIELD_NAME,
      options: { autoFill: "write_timestamp" },
    }

    // Prefill only an empty by-field selection; never override a chosen path
    // or switch the mode on the author's behalf.
    const prefill =
      mutation.partitioning !== false && mutation.partitioning.length === 0
    const withField = addFieldOp(editor.state, [], field)
    const next = prefill
      ? {
          ...withField,
          mutation: {
            ...mutation,
            partitioning: writeTimestampPartitioning(field.id),
          },
        }
      : withField
    editor.replaceState(next, { commit: true })
    editor.selectField(field.id)

    const toastId = toast.add({
      type: "success",
      title: "Write-timestamp field added",
      description: prefill
        ? `${field.name} (DateTime) is filled by the server on every write. Partitioning set to ${field.name} → year / month / day.`
        : `${field.name} (DateTime) is filled by the server on every write.`,
      actionProps:
        shell === null
          ? undefined
          : {
              children: "Show field",
              onClick: () => {
                shell.setView("fields")
                editor.selectField(field.id)
                toast.close(toastId)
              },
            },
    })
  }

  return (
    <div className="grid gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={existing !== undefined}
        onClick={addAutoFillField}
      >
        <ClockIcon className="size-4" />
        Add write-timestamp field
      </Button>
      <span className="text-muted-foreground text-xs">
        {existing === undefined
          ? "Adds a DateTime field stamped by the server on every write (append / full-load-append), with derived _year and _month columns."
          : alreadyAdded
            ? `${AUTO_FILL_DEFAULT_FIELD_NAME} is part of this endpoint and filled by the server on every write.`
            : `A field named ${AUTO_FILL_DEFAULT_FIELD_NAME} already exists. Rename it to add the write-timestamp field.`}
      </span>
    </div>
  )
}

/**
 * The mutation configuration form (task 14).
 *
 * A switch enables or disables mutation — disabled exports `mutation: false`,
 * enabled exports a config object (Req 5.1). When enabled it exposes
 * `loadStrategy`, `basePath`, the partitioning controls, and the
 * write-timestamp auto-fill helper, with the effective defaults prefilled so
 * the JSON stays minimal (the mapping layer omits default `partitioningFormat`
 * on export and always emits an explicit `partitioning`).
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

          <AutoFillHelper mutation={mutation} />
        </>
      )}
    </div>
  )
}
