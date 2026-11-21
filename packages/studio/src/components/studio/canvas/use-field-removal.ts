import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import type { FieldPath } from "@/core"
import { fieldAt, planFieldRemoval } from "@/core"

import type { PendingFieldRemoval } from "../remove-field-dialog"
import { useEditorContext } from "../use-editor"

/**
 * A removal awaiting confirmation, held by the single shared controller. Keeps
 * the field `path` so a confirm removes exactly the requested field.
 */
interface PendingCanvasFieldRemoval extends PendingFieldRemoval {
  /** The path of the field whose removal is pending. */
  path: FieldPath
}

/**
 * The shared field-removal API every canvas node drives. One dialog instance
 * (hoisted to the canvas surface) is bound to `pending`.
 */
export interface FieldRemovalApi {
  /** The pending removal, or `null` when no confirmation is open. */
  pending: PendingFieldRemoval | null
  /**
   * Requests removal of the field at `path`. A field the partitioning does not
   * reference is removed at once; a referenced one records a pending removal so
   * the dialog opens.
   */
  requestRemove: (path: FieldPath) => void
  /** Removes the pending field and its partition segments, then closes. */
  confirm: () => void
  /** Discards the pending removal and closes; nothing is deleted. */
  cancel: () => void
}

/**
 * The shared field-removal controller for the canvas. Removing a field that the
 * partitioning references needs confirmation; the confirmed removal goes
 * through the core `removeField`, which drops the field and only its segments
 * in one history snapshot.
 *
 * @returns The {@link FieldRemovalApi} consumed by the nodes and the dialog.
 */
export function useCanvasFieldRemoval(): FieldRemovalApi {
  const editor = useEditorContext()
  const [pending, setPending] = useState<PendingCanvasFieldRemoval | null>(null)

  const requestRemove = useCallback(
    (path: FieldPath) => {
      const plan = planFieldRemoval(editor.state, path)
      if (plan.affectedPartitionSegments.length === 0) {
        editor.removeField(path)
        return
      }
      setPending({
        path,
        fieldName: fieldAt(editor.state.fields, path)?.name ?? "",
        segments: plan.affectedPartitionSegments,
      })
    },
    [editor]
  )

  const confirm = useCallback(() => {
    if (pending === null) {
      return
    }
    editor.removeField(pending.path)
    setPending(null)
  }, [editor, pending])

  const cancel = useCallback(() => {
    setPending(null)
  }, [])

  return useMemo<FieldRemovalApi>(
    () => ({
      pending:
        pending === null
          ? null
          : { fieldName: pending.fieldName, segments: pending.segments },
      requestRemove,
      confirm,
      cancel,
    }),
    [pending, requestRemove, confirm, cancel]
  )
}

const FieldRemovalContext = createContext<FieldRemovalApi | null>(null)

/** Provides the single {@link FieldRemovalApi} to the canvas subtree. */
export const FieldRemovalProvider = FieldRemovalContext.Provider

/**
 * Reads the shared {@link FieldRemovalApi} from context.
 *
 * @returns The canvas field-removal API.
 * @throws {Error} When used outside a {@link FieldRemovalProvider}.
 */
export function useFieldRemovalContext(): FieldRemovalApi {
  const api = useContext(FieldRemovalContext)
  if (api === null) {
    throw new Error(
      "useFieldRemovalContext must be used within a FieldRemovalProvider"
    )
  }
  return api
}
