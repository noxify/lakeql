import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { TypeChangePlan } from "@/core"

/**
 * A pending lossy type change awaiting confirmation. Carries the dry-run plan
 * (so the dialog can name what will be lost) and the human-readable label of
 * the target type for the prompt copy.
 */
export interface PendingTypeChange {
  /** The dry-run plan returned by the core type-change op. */
  plan: TypeChangePlan
  /** The target type label, shown in the confirmation copy. */
  targetLabel: string
}

/**
 * The confirmation dialog for a lossy field/array-item type change (Req 3.10,
 * task 16).
 *
 * The underlying core op computes whether a transition is lossy and reports it
 * without applying anything; this dialog surfaces that plan, names the
 * structure that would be discarded, and applies the change only when the user
 * confirms. Declining (cancel or dismiss) leaves the field unchanged — no
 * authored structure is ever dropped silently.
 *
 * It is a controlled dialog: `pending` being non-`null` opens it, and the two
 * callbacks resolve the decision.
 *
 * @param props.pending - The pending change, or `null` when the dialog is
 *   closed.
 * @param props.onConfirm - Invoked when the user accepts the lossy change.
 * @param props.onCancel - Invoked when the user declines or dismisses.
 */
export const TypeChangeConfirmDialog = ({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingTypeChange | null
  onConfirm: () => void
  onCancel: () => void
}) => {
  const lost = pending?.plan.lostDescription
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard structural data?</AlertDialogTitle>
          <AlertDialogDescription>
            {pending === null ? null : (
              <>
                Changing this field to <strong>{pending.targetLabel}</strong>{" "}
                will discard {lost ?? "its structural children"}. This cannot be
                undone from here.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep field</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Discard and change
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
