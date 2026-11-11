import { LockIcon } from "lucide-react"

import { LOAD_TIMESTAMP_FIELD_NAME } from "@/core"

/**
 * The synthesized, read-only Fields-list row for the managed `load_timestamp`
 * field shown while timestamp partitioning mode is active.
 *
 * This is a pure view-model row: it is never part of `state.fields`, carries no
 * name input, type select, remove button, or move/grip affordance, and is not a
 * `SortableContext` item. It derives entirely from mutation state, so leaving
 * timestamp mode removes it with no `state.fields` mutation and no undo/redo
 * entry.
 *
 * Its read-only, managed nature is conveyed to assistive technology through the
 * group's accessible name ("… (managed, read-only)") plus the visible "Managed"
 * badge and helper text — `aria-readonly` is deliberately NOT used because it is
 * not a valid ARIA attribute on `role="group"`.
 */
export const DerivedLoadTimestampRow = () => (
  <div
    role="group"
    aria-label={`${LOAD_TIMESTAMP_FIELD_NAME} (managed, read-only)`}
    className="border-border bg-muted/40 text-muted-foreground flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2"
  >
    <LockIcon className="size-4 shrink-0" aria-hidden="true" />
    <span className="text-foreground font-mono text-sm">
      {LOAD_TIMESTAMP_FIELD_NAME}
    </span>
    <span className="text-xs">DateTime</span>
    <span className="bg-accent text-accent-foreground rounded-sm px-1.5 py-0.5 text-xs font-medium">
      Managed
    </span>
    <span className="w-full text-xs">
      Added automatically in timestamp mode; filled by the CLI/runtime.
    </span>
  </div>
)
