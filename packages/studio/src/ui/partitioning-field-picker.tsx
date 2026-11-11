import { validatePartitioningFormat } from "@lakeql/schema-generator/endpoint-schema"
import { useId } from "react"

import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox"
import type { EditorMutation } from "@/core"

import { PartitionBadges } from "./partition-badges"
import type { PartitionOption } from "./partition-format"
import {
  parsePartitionSegments,
  partitionOptionsFor,
  serializePartitionSegments,
  topLevelPartitionCandidates,
} from "./partition-format"
import { useEditorContext } from "./use-editor"

/**
 * The "by field / custom format" partition picker.
 *
 * A single combobox over the resolved partition options (one per top-level
 * primitive field, six per `Date`/`DateTime` field) assembles the frozen
 * `/`-separated `partitioning` string. Choosing an option appends its segment
 * and re-serializes; an already-chosen `field+component` option is hidden so
 * the exact combination cannot repeat (the same date field with a different
 * component stays available). Chosen segments render as a sortable row of
 * removable badges in `/`-segment order. The assembled string is live-validated
 * with `validatePartitioningFormat` and the error is surfaced inline.
 *
 * @param props.mutation - The enabled mutation whose `partitioning` string this
 *   control reads and writes.
 */
export const PartitioningFieldPicker = ({
  mutation,
}: {
  mutation: Extract<EditorMutation, { enabled: true }>
}) => {
  const editor = useEditorContext()
  const errorId = useId()

  const partitionString =
    typeof mutation.partitioning === "string" ? mutation.partitioning : ""
  const segments = parsePartitionSegments(partitionString)

  const allOptions = partitionOptionsFor(
    topLevelPartitionCandidates(editor.state.fields)
  )
  // Hide an option whose exact field+component segment is already chosen.
  const chosen = new Set(
    segments.map((segment) =>
      segment.component === undefined
        ? segment.field
        : `${segment.field}:${segment.component}`
    )
  )
  const options = allOptions.filter((option) => !chosen.has(option.value))

  const error =
    partitionString === "" ? null : validatePartitioningFormat(partitionString)

  const commit = (next: string): void => {
    editor.setMutation({ ...mutation, partitioning: next })
  }

  const handleSelect = (value: string | null): void => {
    if (value === null) {
      return
    }
    const option = allOptions.find((candidate) => candidate.value === value)
    if (option === undefined) {
      return
    }
    commit(serializePartitionSegments([...segments, option.segment]))
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Partition fields</span>

      <Combobox<PartitionOption["value"]>
        items={options.map((option) => option.value)}
        value={null}
        onValueChange={handleSelect}
      >
        <ComboboxInput
          placeholder="Add a field or date component…"
          aria-label="Add partition field"
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : errorId}
        />
        <ComboboxPopup>
          <ComboboxEmpty>
            No partitionable fields. Add a top-level non-object field.
          </ComboboxEmpty>
          <ComboboxList aria-label="Partition field suggestions">
            {options.map((option) => (
              <ComboboxItem key={option.value} value={option.value}>
                {option.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>

      <PartitionBadges
        segments={segments}
        onChange={(_next, serialized) => commit(serialized)}
      />

      {error === null ? (
        <p className="text-muted-foreground text-xs">
          Pick fields (and date components) to build the partition path. Order
          the badges to order the path.
        </p>
      ) : (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  )
}
