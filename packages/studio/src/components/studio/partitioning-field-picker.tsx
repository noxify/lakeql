import { ArrowLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { useEffect, useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { EditorMutation, EditorPartitionSegment } from "@/core"

import { metadataInputId } from "./metadata-nav"
import { PartitionBadges } from "./partition-badges"
import type { PartitionOption } from "./partition-format"
import {
  partitionDateOptions,
  partitionRootOptions,
  partitionSearchOptions,
  partitionSegmentKey,
  topLevelPartitionCandidates,
} from "./partition-format"
import { useEditorContext } from "./use-editor"
import { partitioningIssueMessages } from "./validation-readable"

/** The picker pages: the root field list, or one date field's components. */
type PickerPage = "root" | { fieldId: string }

/** Command item value of a selectable option. */
const optionItemValue = (option: PartitionOption): string =>
  `option:${option.value}`

/** Command item value of the drill-down row of a date field. */
const pageItemValue = (fieldId: string): string => `page:${fieldId}`

/**
 * The partition field picker.
 *
 * A button opens a popover holding a searchable command list. The root page
 * lists every top-level primitive field; choosing a non-date field appends a
 * bare (raw value) segment. A `Date`/`DateTime` field opens a sub-page with a
 * combined `year / month / day` option (three segments in one history
 * snapshot) followed by the six single components. Typing a query searches
 * across fields and components, so `"event year"` finds `event → year`.
 * Escape, or Backspace in an empty search, returns from a sub-page. Segments
 * already chosen are hidden. Chosen segments render as a sortable row of
 * removable badges in path order. Every partitioning issue the validity gate
 * reports sets the error state of the trigger and is shown inline.
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
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<PickerPage>("root")
  const [search, setSearch] = useState("")
  const [activeValue, setActiveValue] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  const segments = mutation.partitioning === false ? [] : mutation.partitioning
  const candidates = topLevelPartitionCandidates(editor.state.fields)
  // Hide an option whose exact field+component segment is already chosen.
  const chosen = new Set(segments.map(partitionSegmentKey))
  // Every partitioning finding comes from the validity gate, so this control,
  // the header count and the Validations list always agree.
  const messages = partitioningIssueMessages(editor.state, editor.validation)
  const invalid = messages.length > 0

  const commit = (next: EditorPartitionSegment[]): void => {
    editor.setMutation({ ...mutation, partitioning: next })
  }

  const subCandidate =
    page === "root"
      ? undefined
      : candidates.find((candidate) => candidate.id === page.fieldId)
  const searching = search.trim() !== ""

  // The date fields that still offer at least one option, shown as drill-down
  // rows on the root page.
  const drillable = new Set(
    candidates
      .filter(
        (candidate) =>
          candidate.isDateLike &&
          partitionDateOptions(candidate, chosen).length > 0
      )
      .map((candidate) => candidate.id)
  )
  const rootOptions = partitionRootOptions(candidates, chosen)
  const searchOptions = partitionSearchOptions(candidates, chosen)
  const subOptions =
    subCandidate === undefined ? [] : partitionDateOptions(subCandidate, chosen)

  /** The first item value of a destination page, so the list starts at its top. */
  const firstValueOf = (destination: PickerPage): string => {
    if (destination === "root") {
      const firstRoot = candidates.find((candidate) =>
        candidate.isDateLike
          ? drillable.has(candidate.id)
          : !chosen.has(candidate.id)
      )
      if (firstRoot === undefined) {
        return ""
      }
      return firstRoot.isDateLike
        ? pageItemValue(firstRoot.id)
        : `option:${firstRoot.id}`
    }
    const candidate = candidates.find(
      (entry) => entry.id === destination.fieldId
    )
    const first =
      candidate === undefined
        ? undefined
        : partitionDateOptions(candidate, chosen)[0]
    return first === undefined ? "" : optionItemValue(first)
  }

  const goToPage = (next: PickerPage): void => {
    setPage(next)
    setSearch("")
    setActiveValue(firstValueOf(next))
  }

  const onOpenChange = (next: boolean): void => {
    setOpen(next)
    // Always reopen on the root page with an empty query.
    if (next) {
      setActiveValue(firstValueOf("root"))
    } else {
      setPage("root")
      setSearch("")
      setActiveValue("")
    }
  }

  // cmdk scrolls the active item into view against the OLD list on a page
  // switch; reset the destination list's scroll once it has rendered.
  useEffect(() => {
    // Read `page` so the reset runs for whichever page we switched to.
    const destination = page
    const frame = requestAnimationFrame(() => {
      if (destination !== null && listRef.current !== null) {
        listRef.current.scrollTop = 0
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [page])

  const handleSelect = (option: PartitionOption): void => {
    commit([...segments, ...option.segments])
    onOpenChange(false)
  }

  // Back-navigation out of a sub-page: Escape always returns (on the root page
  // Escape still closes the popover); Backspace/Delete return only when the
  // search box is empty. Captured before the popover's own Escape handling.
  const onKeyDownCapture = (event: ReactKeyboardEvent): void => {
    if (page === "root") {
      return
    }
    const isEscape = event.key === "Escape"
    const isEmptyDelete =
      (event.key === "Backspace" || event.key === "Delete") && search === ""
    if (isEscape || isEmptyDelete) {
      event.preventDefault()
      event.stopPropagation()
      setPage("root")
      setSearch("")
      setActiveValue(firstValueOf("root"))
    }
  }

  const renderOption = (option: PartitionOption, label: string) => (
    <CommandItem
      key={option.value}
      value={optionItemValue(option)}
      keywords={option.keywords}
      onSelect={() => handleSelect(option)}
    >
      {label}
    </CommandItem>
  )

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Partition fields</span>

      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-fit justify-start"
            />
          }
          // A stable id so the Validations list can jump here and focus it.
          id={metadataInputId("partitioning")}
          aria-label="Add partition field"
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
        >
          <PlusIcon />
          Add a field or date component…
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <Command
            value={activeValue}
            onValueChange={setActiveValue}
            onKeyDownCapture={onKeyDownCapture}
            aria-label="Partition field suggestions"
          >
            <CommandInput
              leading={
                page === "root" ? undefined : (
                  <button
                    type="button"
                    aria-label="Back to fields"
                    onClick={() => goToPage("root")}
                    className="hover:text-foreground focus-visible:ring-ring/50 text-muted-foreground -ml-1 flex size-6 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2"
                  >
                    <ArrowLeftIcon className="size-4" />
                  </button>
                )
              }
              placeholder={
                subCandidate === undefined
                  ? "Search fields and date components…"
                  : `Search ${subCandidate.name} components…`
              }
              value={search}
              onValueChange={setSearch}
            />
            <CommandList ref={listRef}>
              <CommandEmpty>
                {candidates.length === 0
                  ? "No partitionable fields. Add a top-level non-object field."
                  : "No matching field."}
              </CommandEmpty>

              {subCandidate !== undefined && (
                <CommandGroup heading={subCandidate.name}>
                  {subOptions.map((option) =>
                    renderOption(option, option.shortLabel)
                  )}
                </CommandGroup>
              )}

              {subCandidate === undefined && searching && (
                <CommandGroup>
                  {searchOptions.map((option) =>
                    renderOption(option, option.label)
                  )}
                </CommandGroup>
              )}

              {subCandidate === undefined && !searching && (
                <CommandGroup>
                  {candidates.map((candidate) => {
                    if (candidate.isDateLike) {
                      return drillable.has(candidate.id) ? (
                        <CommandItem
                          key={candidate.id}
                          value={pageItemValue(candidate.id)}
                          onSelect={() => goToPage({ fieldId: candidate.id })}
                        >
                          {candidate.name}
                          <ChevronRightIcon className="ml-auto opacity-50" />
                        </CommandItem>
                      ) : null
                    }
                    const option = rootOptions.find(
                      (entry) => entry.value === candidate.id
                    )
                    return option === undefined
                      ? null
                      : renderOption(option, option.label)
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

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
