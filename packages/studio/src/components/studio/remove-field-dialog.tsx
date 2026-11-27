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

/**
 * A field removal awaiting confirmation because the field is referenced by the
 * partitioning.
 */
export interface PendingFieldRemoval {
  /** The name of the field that would be removed (may be empty). */
  fieldName: string
  /** Display labels of the partition segments removed along with it. */
  segments: string[]
}

/**
 * The confirmation dialog for removing a field that the by-field partitioning
 * references.
 *
 * It names the affected partition segments. Confirming removes the field and
 * only those segments (one undo step); cancelling or dismissing deletes
 * nothing. It is a controlled dialog: `pending` being non-`null` opens it.
 *
 * @param props.pending - The pending removal, or `null` when closed.
 * @param props.onConfirm - Invoked when the user confirms the removal.
 * @param props.onCancel - Invoked when the user declines or dismisses.
 */
export const RemoveFieldConfirmDialog = ({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingFieldRemoval | null
  onConfirm: () => void
  onCancel: () => void
}) => (
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
        <AlertDialogTitle>Remove field used for partitioning?</AlertDialogTitle>
        <AlertDialogDescription>
          {pending === null ? null : (
            <>
              {pending.fieldName === "" ? (
                "This field"
              ) : (
                <strong>{pending.fieldName}</strong>
              )}{" "}
              is part of the partition path. Removing it also removes the
              partition {pending.segments.length === 1 ? "segment" : "segments"}{" "}
              <strong>{pending.segments.join(", ")}</strong>. One undo restores
              both.
            </>
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel}>Keep field</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          Remove field and segments
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
