import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import type {
  CoalescingCommitter,
  EditorArrayItemType,
  EditorField,
  EditorFieldType,
  EditorState,
  FieldPath,
  ImportResult,
  Persistence,
  TypeChangePlan,
  ValidationResult,
} from "@/core"
import {
  addField as addFieldOp,
  changeArrayItemType as changeArrayItemTypeOp,
  changeFieldType as changeFieldTypeOp,
  createCoalescingCommitter,
  createField,
  createPersistence,
  currentState,
  downloadEndpointJson,
  evaluate,
  importFromFile,
  removeField as removeFieldOp,
} from "@/core"

/**
 * The outcome of a type-change request routed through the editor.
 *
 * When `applied` is `false` and `plan.needsConfirmation` is `true`, the change
 * was lossy and is awaiting the confirmation dialog (task 16). Until that
 * dialog exists the editor does not apply the change — it never silently drops
 * authored structure.
 */
export interface TypeChangeOutcome {
  /** The dry-run plan from the core operation. */
  plan: TypeChangePlan
  /** Whether the change was applied to the live state. */
  applied: boolean
}

/**
 * The editor API surfaced to the UI. All structural mutations route through the
 * `@/core` operations; this hook owns only the React-facing concerns: the live
 * snapshot, selection, commit coalescing, persistence, and the derived validity
 * gate.
 */
export interface EditorApi {
  /** The live editor state rendered by the UI. */
  state: EditorState
  /** The current validity gate result (drives export + diagnostics). */
  validation: ValidationResult
  /** Whether persistence degraded to in-memory (storage unavailable). */
  persistenceDegraded: boolean
  /** The `id` of the selected field, or `null` when none is selected. */
  selectedFieldId: string | null
  /** Selects a field so the (future) properties panel can target it. */
  selectField: (fieldId: string | null) => void
  /** Replaces the whole live state (import, or a metadata edit). */
  replaceState: (next: EditorState, options?: { commit?: boolean }) => void
  /** Flushes any pending coalesced edit into a committed snapshot. */
  commitEdits: () => void
  /** Adds a field to the container at `parentPath`. */
  addField: (parentPath: FieldPath, field?: EditorField) => void
  /** Removes the field at `path`. */
  removeField: (path: FieldPath) => void
  /** Requests a field type change; lossy changes await confirmation. */
  changeFieldType: (
    path: FieldPath,
    nextType: EditorFieldType,
    options?: { confirm?: boolean }
  ) => TypeChangeOutcome
  /** Requests an array item-type change; lossy changes await confirmation. */
  changeArrayItemType: (
    path: FieldPath,
    nextType: EditorArrayItemType,
    options?: { confirm?: boolean }
  ) => TypeChangeOutcome
  /** Imports a file into the state (no partial apply on failure). */
  importFile: (file: File) => Promise<ImportResult>
  /** Exports the current state as a download; blocked unless valid. */
  exportFile: () => void
}

/**
 * The underlying React state the hook tracks. The committer owns the history
 * and the persistence handle is created once alongside it; `version` is a
 * monotonically increasing counter bumped on every live change so React
 * re-renders without copying the whole history into state.
 */
interface EditorStore {
  committer: CoalescingCommitter
  persistence: Persistence
  version: number
}

/**
 * Drives the Endpoint Builder: seeds from persistence, holds the live state via
 * a coalescing committer, exposes selection, and recomputes the validity gate
 * on every change.
 *
 * Discrete actions (add/remove/type change) commit a history snapshot
 * immediately; continuous edits (metadata/field-name typing) call
 * {@link EditorApi.replaceState} without `commit` and settle into one snapshot
 * on blur via {@link EditorApi.commitEdits}, matching the core's commit
 * semantics.
 *
 * @returns The {@link EditorApi} for the composition root and its children.
 */
export function useEditor(): EditorApi {
  const [store, setStore] = useState<EditorStore>(() => {
    const persistence = createPersistence()
    const restored = persistence.restore()
    const committer = createCoalescingCommitter({
      snapshots: [restored],
      cursor: 0,
    })
    return { committer, persistence, version: 0 }
  })

  const { committer, persistence } = store

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)

  const state = currentState(committer.history)

  // Release persistence timers/listeners when the builder unmounts.
  useEffect(() => () => persistence.dispose(), [persistence])

  // Autosave the live state on every change (debounced inside persistence).
  useEffect(() => {
    persistence.save(state)
  }, [persistence, state])

  const bump = useCallback(() => {
    setStore((previous) => ({ ...previous, version: previous.version + 1 }))
  }, [])

  const replaceState = useCallback(
    (next: EditorState, options: { commit?: boolean } = {}) => {
      committer.edit(next)
      if (options.commit === true) {
        committer.flush()
      }
      bump()
    },
    [committer, bump]
  )

  const commitEdits = useCallback(() => {
    committer.flush()
    bump()
  }, [committer, bump])

  const commit = useCallback(
    (next: EditorState) => {
      replaceState(next, { commit: true })
    },
    [replaceState]
  )

  const addField = useCallback(
    (parentPath: FieldPath, field: EditorField = createField()) => {
      commit(addFieldOp(currentState(committer.history), parentPath, field))
      setSelectedFieldId(field.id)
    },
    [committer, commit]
  )

  const removeField = useCallback(
    (path: FieldPath) => {
      commit(removeFieldOp(currentState(committer.history), path))
      setSelectedFieldId(null)
    },
    [committer, commit]
  )

  const changeFieldType = useCallback(
    (
      path: FieldPath,
      nextType: EditorFieldType,
      options: { confirm?: boolean } = {}
    ): TypeChangeOutcome => {
      const result = changeFieldTypeOp(
        currentState(committer.history),
        path,
        nextType,
        options
      )
      if (result.applied) {
        commit(result.state)
      }
      return { plan: result.plan, applied: result.applied }
    },
    [committer, commit]
  )

  const changeArrayItemType = useCallback(
    (
      path: FieldPath,
      nextType: EditorArrayItemType,
      options: { confirm?: boolean } = {}
    ): TypeChangeOutcome => {
      const result = changeArrayItemTypeOp(
        currentState(committer.history),
        path,
        nextType,
        options
      )
      if (result.applied) {
        commit(result.state)
      }
      return { plan: result.plan, applied: result.applied }
    },
    [committer, commit]
  )

  const importFile = useCallback(
    async (file: File): Promise<ImportResult> => {
      const result = await importFromFile(file)
      if (result.ok) {
        commit(result.state)
        setSelectedFieldId(null)
      }
      return result
    },
    [commit]
  )

  const exportFile = useCallback(() => {
    downloadEndpointJson(currentState(committer.history))
  }, [committer])

  const validation = useMemo(() => evaluate(state), [state])

  return {
    state,
    validation,
    persistenceDegraded: persistence.degraded,
    selectedFieldId,
    selectField: setSelectedFieldId,
    replaceState,
    commitEdits,
    addField,
    removeField,
    changeFieldType,
    changeArrayItemType,
    importFile,
    exportFile,
  }
}

/**
 * React context carrying the single {@link EditorApi} down to the tree and
 * panels, so a deeply nested `FieldNode` can mutate state without prop
 * drilling.
 */
const EditorContext = createContext<EditorApi | null>(null)

/**
 * Provides the {@link EditorApi} to a subtree.
 */
export const EditorProvider = EditorContext.Provider

/**
 * Reads the {@link EditorApi} from context.
 *
 * @returns The editor API provided by the composition root.
 * @throws {Error} When used outside an {@link EditorProvider}.
 */
export function useEditorContext(): EditorApi {
  const api = useContext(EditorContext)
  if (api === null) {
    throw new Error("useEditorContext must be used within an EditorProvider")
  }
  return api
}
