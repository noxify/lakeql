import { useId } from "react"

import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox"
import type { EditorMutation, EditorPartitionSegment } from "@/core"

import { metadataInputId } from "./metadata-nav"
import { PartitionBadges } from "./partition-badges"
import type { PartitionOption } from "./partition-format"
import {
  partitionOptionsFor,
  partitionSegmentKey,
  topLevelPartitionCandidates,
} from "./partition-format"
import { useEditorContext } from "./use-editor"
import { partitioningIssueMessages } from "./validation-readable"

/**
 * The "by field / custom format" partition picker.
 *
 * A single combobox over the resolved partition options (one per top-level
 * primitive field, six per `Date`/`DateTime` field) assembles the frozen
 * list of id-based partition segments. Choosing an option appends its segment;
 * an already-chosen `field+component` option is hidden so
 * the exact combination cannot repeat (the same date field with a different
 * component stays available). Chosen segments render as a sortable row of
 * removable badges in path order. Every partitioning issue the validity gate
 * reports (an empty selection, a malformed segment, a companion column, or a
 * name matching no single field) sets the error state and is shown inline.
 *
 * @param props.mutation - The enabled mutation whose `partitioning` segments
 *   this control reads and writes.
 */
export const PartitioningFieldPicker = ({
  mutation,
}: {
  mutation: Extract<EditorMutation, { enabled: true }>
}) => {
  const editor = useEditorContext()
  const errorId = useId()

  const segments = mutation.partitioning === false ? [] : mutation.partitioning
  const allOptions = partitionOptionsFor(
    topLevelPartitionCandidates(editor.state.fields)
  )
  // Hide an option whose exact field+component segment is already chosen.
  const chosen = new Set(segments.map(partitionSegmentKey))
  const options = allOptions.filter((option) => !chosen.has(option.value))
  // Every partitioning finding comes from the validity gate — an empty
  // selection, a malformed segment, a companion column, or a name matching no
  // single field — so this control, the header count and the Validations list
  // always agree.
  const messages = partitioningIssueMessages(editor.state, editor.validation)
  const invalid = messages.length > 0

  const commit = (next: EditorPartitionSegment[]): void => {
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
    commit([...segments, option.segment])
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
          // A stable id so the Validations list can jump here and focus it.
          id={metadataInputId("partitioning")}
          placeholder="Add a field or date component…"
          aria-label="Add partition field"
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
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
        fields={editor.state.fields}
        onChange={commit}
      />

      {invalid ? (
        <div id={errorId} className="grid gap-0.5">
          {messages.map((message) => (
            <p key={message} className="text-destructive text-xs">
              {message}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Pick fields (and date components) to build the partition path. Order
          the badges to order the path.
        </p>
      )}
    </div>
  )
}
