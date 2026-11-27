import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import type { EditorArrayItemType, EditorFieldType, FieldPath } from "@/core"

import type { PendingTypeChange } from "../type-change-dialog"
import { useEditorContext } from "../use-editor"

/**
 * A lossy type change awaiting confirmation, held by the single shared
 * controller. Carries the field `path` and the requested type so a confirm can
 * re-apply the exact change, plus the dry-run plan and target label the shared
 * dialog renders.
 */
interface PendingCanvasTypeChange extends PendingTypeChange {
  /** The path of the field whose type change is pending. */
  path: FieldPath
  /** Whether the change targets the field type or an `Array` item type. */
  kind: "field" | "item"
  /** The requested next type, re-applied verbatim on confirm. */
  nextType: EditorFieldType | EditorArrayItemType
}

/**
 * The shared type-change API every canvas node drives. A single dialog instance
 * (hoisted to the canvas surface) is bound to `pending`; nodes only request a
 * change and the controller decides whether it is lossy and needs the dialog.
 */
export interface TypeChangeApi {
  /**
   * The current pending lossy change, or `null` when no confirmation is open.
   * Drives the single shared {@link TypeChangeConfirmDialog}.
   */
  pending: PendingTypeChange | null
  /**
   * Requests a field type change at `path`. Applies immediately when
   * non-lossy; otherwise records the pending change so the shared dialog opens.
   */
  requestFieldType: (path: FieldPath, nextType: EditorFieldType) => void
  /**
   * Requests an `Array` item-type change at `path`. Applies immediately when
   * non-lossy; otherwise records the pending change so the shared dialog opens.
   */
  requestArrayItemType: (path: FieldPath, nextType: EditorArrayItemType) => void
  /** Applies the pending change (user confirmed) and closes the dialog. */
  confirm: () => void
  /** Discards the pending change (user declined) and closes the dialog. */
  cancel: () => void
}

/**
 * The shared type-change controller for the canvas. Owns the single pending
 * lossy change so one {@link TypeChangeConfirmDialog} instance can be hoisted to
 * the canvas surface instead of mounting one dialog per node.
 *
 * Behaviour matches the previous per-node dialog exactly (Req 3.10): a lossy
 * change still prompts, applies only on confirm, and a decline leaves the field
 * unchanged. Requesting a change on one field replaces any pending change on
 * another, so only one confirmation is ever open at a time.
 *
 * @returns The {@link TypeChangeApi} consumed by the nodes and the shared
 *   dialog.
 */
export function useCanvasTypeChange(): TypeChangeApi {
  const editor = useEditorContext()
  const [pending, setPending] = useState<PendingCanvasTypeChange | null>(null)

  const requestFieldType = useCallback(
    (path: FieldPath, nextType: EditorFieldType) => {
      const outcome = editor.changeFieldType(path, nextType)
      if (!outcome.applied && outcome.plan.needsConfirmation) {
        setPending({
          kind: "field",
          path,
          nextType,
          plan: outcome.plan,
          targetLabel: nextType,
        })
      }
    },
    [editor]
  )

  const requestArrayItemType = useCallback(
    (path: FieldPath, nextType: EditorArrayItemType) => {
      const outcome = editor.changeArrayItemType(path, nextType)
      if (!outcome.applied && outcome.plan.needsConfirmation) {
        setPending({
          kind: "item",
          path,
          nextType,
          plan: outcome.plan,
          targetLabel: `Array of ${nextType}`,
        })
      }
    },
    [editor]
  )

  const confirm = useCallback(() => {
    // Apply the confirmed change as a side effect in the callback body, not
    // inside a `setPending` updater: updaters must be pure, and StrictMode
    // (on in both shipped entry points) double-invokes them, which would
    // re-apply the change twice. Read the current pending change, apply it,
    // then clear it.
    if (pending === null) {
      return
    }
    if (pending.kind === "field") {
      editor.changeFieldType(
        pending.path,
        pending.nextType as EditorFieldType,
        { confirm: true }
      )
    } else {
      editor.changeArrayItemType(
        pending.path,
        pending.nextType as EditorArrayItemType,
        { confirm: true }
      )
    }
    setPending(null)
  }, [editor, pending])

  const cancel = useCallback(() => {
    setPending(null)
  }, [])

  return useMemo<TypeChangeApi>(
    () => ({
      pending:
        pending === null
          ? null
          : { plan: pending.plan, targetLabel: pending.targetLabel },
      requestFieldType,
      requestArrayItemType,
      confirm,
      cancel,
    }),
    [pending, requestFieldType, requestArrayItemType, confirm, cancel]
  )
}

const TypeChangeContext = createContext<TypeChangeApi | null>(null)

/**
 * Provides the single {@link TypeChangeApi} to the canvas subtree so every node
 * drives the one shared confirmation dialog.
 */
export const TypeChangeProvider = TypeChangeContext.Provider

/**
 * Reads the shared {@link TypeChangeApi} from context.
 *
 * @returns The canvas type-change API.
 * @throws {Error} When used outside a {@link TypeChangeProvider}.
 */
export function useTypeChangeContext(): TypeChangeApi {
  const api = useContext(TypeChangeContext)
  if (api === null) {
    throw new Error(
      "useTypeChangeContext must be used within a TypeChangeProvider"
    )
  }
  return api
}
