import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react"

import { useFieldFocusContext } from "./canvas/use-field-focus"
import { metadataInputId } from "./metadata-nav"
import { useShellView } from "./shell-view"
import { useEditorContext } from "./use-editor"
import type { ReadableIssue } from "./validation-readable"
import { toReadableIssues } from "./validation-readable"

/**
 * A single clickable (navigable) issue entry. Activating it jumps to the
 * offending target:
 *
 * - a field issue switches to the Fields view, selects the field, and moves
 *   keyboard focus to its name input;
 * - a metadata issue switches to the Settings view and moves keyboard focus to
 *   the matching form input, after the view has rendered.
 */
const NavigableIssue = ({ issue }: { issue: ReadableIssue }) => {
  const editor = useEditorContext()
  const fieldFocus = useFieldFocusContext()
  const { setView } = useShellView()

  const jump = (): void => {
    const { metadataKey } = issue
    if (metadataKey !== undefined) {
      setView("settings")
      // The Settings view mounts on the render triggered by `setView`, so its
      // input is not in the DOM yet. Defer focus to the next frame — the same
      // post-render timing the field path gets from `focusField`'s effect —
      // rather than focusing synchronously before the input exists.
      const targetId = metadataInputId(metadataKey)
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`#${CSS.escape(targetId)}`)?.focus()
      })
      return
    }
    const { fieldId } = issue
    if (fieldId === undefined) {
      return
    }
    setView("fields")
    editor.selectField(fieldId)
    fieldFocus.focusField(fieldId)
  }

  return (
    <li>
      <button
        type="button"
        onClick={jump}
        className="border-border hover:border-ring focus-visible:border-ring focus-visible:ring-ring/50 grid w-full gap-0.5 rounded-md border p-2 text-left outline-none focus-visible:ring-3"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <CircleAlertIcon className="text-destructive size-4 shrink-0" />
          {issue.label}
        </span>
        <span className="text-muted-foreground text-xs">{issue.message}</span>
      </button>
    </li>
  )
}

/**
 * A single non-navigable issue entry (a metadata violation with no focusable
 * input, such as `version`): shown with its readable description but not
 * clickable, so there is no dead jump target (Req 5.3).
 */
const NonNavigableIssue = ({ issue }: { issue: ReadableIssue }) => (
  <li>
    <div className="border-border/60 bg-muted/30 grid gap-0.5 rounded-md border p-2">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <CircleAlertIcon className="text-destructive size-4 shrink-0" />
        {issue.label}
      </span>
      <span className="text-muted-foreground text-xs">{issue.message}</span>
    </div>
  </li>
)

/**
 * The Validations summary (the Validations rail section's secondary sidebar):
 * a consolidated, readable list of every current validity-gate issue via
 * {@link toReadableIssues}, with a clear "ready to export" state when there are
 * none (Req 5.1).
 *
 * Field-keyed issues render as clickable entries that jump to and focus the
 * offending field (Req 5.4, 5.6); navigable metadata issues render as clickable
 * entries that jump to the Settings view and focus the matching input; only a
 * non-navigable metadata issue (e.g. `version`) renders as a shown-but-not-
 * clickable entry (Req 5.3). The list is live — it is derived from the same
 * `evaluate()` result the gate uses, so the issue count here matches the export
 * gate exactly (Req 5.5).
 */
export const ValidationsView = () => {
  const editor = useEditorContext()
  const issues = toReadableIssues(editor.state, editor.validation)

  if (issues.length === 0) {
    return (
      <div
        role="note"
        aria-label="Ready to export"
        className="text-muted-foreground grid gap-1.5 p-2 text-sm"
      >
        <span className="text-foreground flex items-center gap-1.5 font-medium">
          <CheckCircle2Icon className="text-primary size-4" />
          Ready to export
        </span>
        <span className="text-xs">
          No validation issues. The definition can be exported.
        </span>
      </div>
    )
  }

  return (
    <div className="grid gap-2 p-2">
      <p className="text-destructive text-xs font-medium" aria-live="polite">
        {issues.length} issue{issues.length === 1 ? "" : "s"} blocking export
      </p>
      <ul className="grid gap-1.5">
        {issues.map((issue) =>
          issue.navigable ? (
            <NavigableIssue key={issue.id} issue={issue} />
          ) : (
            <NonNavigableIssue key={issue.id} issue={issue} />
          )
        )}
      </ul>
    </div>
  )
}
