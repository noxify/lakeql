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
import type { WriteMethodChangePlan } from "@/core"

/**
 * The confirmation dialog for switching the write method from storage to
 * insert when that discards values.
 *
 * It lists what the switch discards (base path, partitioning, auto-fill
 * options) and applies the change only on confirm. It is controlled: `plan`
 * being non-`null` opens it, and the two callbacks resolve the decision.
 *
 * @param props.plan - The dry-run plan, or `null` when the dialog is closed.
 * @param props.onConfirm - Invoked when the user accepts the switch.
 * @param props.onCancel - Invoked when the user declines or dismisses.
 */
export const WriteMethodChangeDialog = ({
  plan,
  onConfirm,
  onCancel,
}: {
  plan: WriteMethodChangePlan | null
  onConfirm: () => void
  onCancel: () => void
}) => (
  <AlertDialog
    open={plan !== null}
    onOpenChange={(open) => {
      if (!open) {
        onCancel()
      }
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Switch to the insert write method?</AlertDialogTitle>
        <AlertDialogDescription>
          The insert method writes rows with INSERT statements. It does not use
          a base path, partitioning or auto-fill fields, so the switch removes
          these:
        </AlertDialogDescription>
      </AlertDialogHeader>
      {plan === null ? null : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {plan.discardsBasePath && (
            <li>
              Base path <code>{plan.discardedBasePath}</code> is removed.
            </li>
          )}
          {plan.discardsPartitioning && (
            <li>
              Partitioning <code>{plan.discardedPartitioningLabel}</code> is
              turned off.
            </li>
          )}
          {plan.autoFillFields.map((name) => (
            <li key={name}>
              <code>{name}</code> stops being filled by the server. It becomes a
              normal input clients write, and its <code>{name}_year</code> /{" "}
              <code>{name}_month</code> columns are removed from the query type
              and table.
            </li>
          ))}
        </ul>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel}>Keep storage</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          Switch to insert
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
