import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import type { EditorField, EditorFieldType, MovePlan, MoveSlot } from "@/core"
import {
  createField,
  enumerateMoveSlots,
  findContainerPath,
  findFieldPath,
  planMove,
} from "@/core"

import { useEditorContext } from "../use-editor"

/**
 * The live keyboard-move state the canvas renders while a field is grabbed:
 * which field is being moved, the current candidate slot under the cursor, and
 * whether that slot is a structurally valid destination for the grabbed field.
 * `null` when no field is grabbed (Idle).
 */
export interface KeyboardMoveState {
  /** The stable id of the grabbed field. */
  fromId: string
  /** The candidate insert slot the cursor is currently on. */
  slot: MoveSlot
  /** The {@link planMove} result for the grabbed field at the current slot. */
  plan: MovePlan
}

/**
 * The keyboard-move API exposed to the palette, nodes, canvas surface, and the
 * live-region announcer. It owns a small "grab / move / drop" state machine
 * layered over the same pure core ops the pointer drop handler uses — never a
 * canvas-local reimplementation of the structural mutation.
 */
export interface KeyboardMoveApi {
  /** The live keyboard-move state, or `null` when idle. */
  move: KeyboardMoveState | null
  /** The message to announce in the live region for the latest action. */
  announcement: string
  /**
   * Whether `fieldId` is the grabbed field, for `aria-grabbed` on its node.
   */
  isGrabbed: (fieldId: string) => boolean
  /**
   * Picks up `fieldId` to start a keyboard move, if nothing is grabbed yet
   * (idempotent under React StrictMode double-invoke). The cursor starts on the
   * field's current position so the first arrow press moves it somewhere new.
   */
  grab: (fieldId: string) => void
  /**
   * Handles a key press while a field is grabbed: arrow keys step the cursor,
   * `Enter`/`Space` commits a valid slot, `Escape` cancels. A no-op when idle.
   * Returns `true` when the event was handled (so the caller can
   * `preventDefault`/`stopPropagation`).
   */
  handleGrabbedKey: (key: string) => boolean
  /**
   * Registers the focusable element of a field node so focus can be restored to
   * the moved field after a commit (its DOM node is replaced on re-render).
   * Pass `null` to unregister on unmount.
   */
  registerNodeRef: (fieldId: string, element: HTMLElement | null) => void
  /**
   * Requests programmatic focus of the field carrying `fieldId`, used by
   * jump-to-field: it sets the internal focus target so the post-render effect
   * moves focus once that field's node ref is present. Unlike a committed
   * move/add this drives focus alone (no state mutation), so a caller pairs it
   * with `selectField` to also select the field. Harmless when `fieldId` names
   * no current field — the effect simply never finds a node to focus.
   */
  focusField: (fieldId: string) => void
  /**
   * Adds a field of `fieldType` from the palette by keyboard, inserting it into
   * the currently-selected container (the selected field if it is a container,
   * else its nearest container ancestor, else the top level). Focus lands on the
   * new field after it renders.
   */
  addFromPalette: (fieldType: EditorFieldType) => void
}

/**
 * Resolves the container a keyboard palette-add should target from the current
 * selection: the selected field itself when it is a field-holding container,
 * otherwise its nearest container ancestor, otherwise the top level (`null`).
 */
function selectedContainerId(
  fields: EditorField[],
  selectedFieldId: string | null
): string | null {
  if (selectedFieldId === null) {
    return null
  }
  const path = findFieldPath(fields, selectedFieldId)
  if (path === undefined) {
    return null
  }
  // Walk the selected field's own path from deepest to shallowest, returning
  // the first field that is a container: the selected field itself when it is a
  // container, otherwise its nearest container ancestor.
  for (let depth = path.length; depth >= 1; depth -= 1) {
    const candidate = fieldAtPath(fields, path.slice(0, depth))
    if (candidate !== undefined && isContainer(candidate)) {
      return candidate.id
    }
  }
  return null
}

/** Returns whether a field is a field-holding container (Object / Array-of-Object). */
function isContainer(field: EditorField): boolean {
  if (field.type === "Object") {
    return true
  }
  return field.type === "Array" && field.items?.type === "Object"
}

/** Resolves the field at a path, following each level's child container. */
function fieldAtPath(
  fields: EditorField[],
  path: number[]
): EditorField | undefined {
  let currentFields: EditorField[] | undefined = fields
  let field: EditorField | undefined
  for (const index of path) {
    if (currentFields === undefined) {
      return undefined
    }
    field = currentFields[index]
    if (field === undefined) {
      return undefined
    }
    currentFields =
      field.type === "Object"
        ? field.fields
        : field.type === "Array" && field.items?.type === "Object"
          ? field.items.fields
          : undefined
  }
  return field
}

/** The name shown in announcements for a field id, or a fallback. */
function fieldLabel(fields: EditorField[], fieldId: string): string {
  const path = findFieldPath(fields, fieldId)
  const field = path === undefined ? undefined : fieldAtPath(fields, path)
  if (field === undefined || field.name === "") {
    return "unnamed field"
  }
  return field.name
}

/** Builds the announcement describing the slot the cursor is on. */
function slotAnnouncement(
  fields: EditorField[],
  slot: MoveSlot,
  plan: MovePlan
): string {
  const where =
    slot.beforeId === null
      ? slot.containerId === null
        ? "the end of the top level"
        : `the end of ${fieldLabel(fields, slot.containerId)}`
      : `before ${fieldLabel(fields, slot.beforeId)}`
  if (!plan.ok) {
    return `Cannot drop ${where}: ${plan.reason ?? "this move is not possible."}`
  }
  if (plan.reason !== undefined) {
    return `${capitalize(where)}. ${plan.reason}`
  }
  return `${capitalize(where)}.`
}

/** Capitalizes the first letter of a sentence fragment. */
function capitalize(text: string): string {
  return text.slice(0, 1).toUpperCase() + text.slice(1)
}

/**
 * The keyboard "grab / move / drop" controller (Requirement 5.2-5.4).
 *
 * Focus a node and pick it up (`grab`) → arrow keys step a cursor through
 * {@link enumerateMoveSlots}, each gated live by {@link planMove} and surfaced
 * via the shared `DropIndicator`/announcer → `Enter`/`Space` commits a valid
 * slot through `editor.moveField` (exactly one snapshot) → `Escape` cancels. A
 * palette source adds into the selected container by keyboard. After a commit
 * (move or add) focus is programmatically restored to the moved/added field,
 * whose DOM node is replaced on re-render.
 *
 * The state machine is idempotent so React StrictMode's double-invocation does
 * not pick up or commit twice (the existing `moveField` no-op guard reinforces
 * this), and it drives no new core mutation logic — it is additive UI over the
 * same ops the pointer path uses.
 *
 * @returns The {@link KeyboardMoveApi} consumed by the canvas subtree.
 */
export function useKeyboardMove(): KeyboardMoveApi {
  const editor = useEditorContext()
  const [grabbedId, setGrabbedId] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const [announcement, setAnnouncement] = useState("")

  // Focusable node elements, keyed by field id, for post-commit focus restore.
  const nodeRefs = useRef(new Map<string, HTMLElement>())
  // A field id to focus on the next render after a commit, consumed once.
  const focusTargetRef = useRef<string | null>(null)

  const slots = useMemo(
    () => (grabbedId === null ? [] : enumerateMoveSlots(editor.state)),
    [grabbedId, editor.state]
  )

  const clampedCursor =
    slots.length === 0 ? 0 : Math.min(cursor, slots.length - 1)
  const currentSlot = slots[clampedCursor]

  const move: KeyboardMoveState | null = useMemo(() => {
    if (grabbedId === null || currentSlot === undefined) {
      return null
    }
    return {
      fromId: grabbedId,
      slot: currentSlot,
      plan: planMove(editor.state, grabbedId, currentSlot),
    }
  }, [grabbedId, currentSlot, editor.state])

  const registerNodeRef = useCallback(
    (fieldId: string, element: HTMLElement | null) => {
      if (element === null) {
        nodeRefs.current.delete(fieldId)
      } else {
        nodeRefs.current.set(fieldId, element)
      }
    },
    []
  )

  // After a commit, restore focus to the moved/added field once its node has
  // rendered. Consumed once so unrelated re-renders do not steal focus.
  useEffect(() => {
    const target = focusTargetRef.current
    if (target === null) {
      return
    }
    const element = nodeRefs.current.get(target)
    if (element !== undefined) {
      focusTargetRef.current = null
      element.focus()
    }
  })

  const grab = useCallback(
    (fieldId: string) => {
      // Idempotent: a double pick-up (StrictMode) does not restart the move.
      setGrabbedId((previous) => (previous === null ? fieldId : previous))
      const allSlots = enumerateMoveSlots(editor.state)
      // Start the cursor on the field's current position so the first arrow
      // press moves it to a genuinely new slot.
      const startIndex = allSlots.findIndex((slot) => slot.beforeId === fieldId)
      setCursor(startIndex === -1 ? 0 : startIndex)
      setAnnouncement(
        `Picked up ${fieldLabel(editor.state.fields, fieldId)}. Use the arrow keys to choose a position, Enter to drop, Escape to cancel.`
      )
    },
    [editor.state]
  )

  const cancel = useCallback(
    (fromId: string) => {
      setGrabbedId(null)
      setAnnouncement(
        `Cancelled moving ${fieldLabel(editor.state.fields, fromId)}.`
      )
      // Restore focus to the source node.
      focusTargetRef.current = fromId
    },
    [editor.state]
  )

  const commit = useCallback(
    (fromId: string, slot: MoveSlot) => {
      editor.moveField(fromId, slot)
      setGrabbedId(null)
      setAnnouncement(`Dropped ${fieldLabel(editor.state.fields, fromId)}.`)
      focusTargetRef.current = fromId
    },
    [editor]
  )

  const handleGrabbedKey = useCallback(
    (key: string): boolean => {
      if (grabbedId === null || slots.length === 0) {
        return false
      }
      if (key === "Escape") {
        cancel(grabbedId)
        return true
      }
      if (key === "Enter" || key === " " || key === "Spacebar") {
        const slot = slots[clampedCursor]
        if (slot === undefined) {
          return true
        }
        const plan = planMove(editor.state, grabbedId, slot)
        if (!plan.ok) {
          // Keep grabbed; the rejection reason is already surfaced.
          setAnnouncement(slotAnnouncement(editor.state.fields, slot, plan))
          return true
        }
        commit(grabbedId, slot)
        return true
      }
      let next = clampedCursor
      if (key === "ArrowDown" || key === "ArrowRight") {
        next = Math.min(clampedCursor + 1, slots.length - 1)
      } else if (key === "ArrowUp" || key === "ArrowLeft") {
        next = Math.max(clampedCursor - 1, 0)
      } else {
        return false
      }
      setCursor(next)
      const slot = slots[next]
      if (slot !== undefined) {
        setAnnouncement(
          slotAnnouncement(
            editor.state.fields,
            slot,
            planMove(editor.state, grabbedId, slot)
          )
        )
      }
      return true
    },
    [grabbedId, slots, clampedCursor, editor.state, cancel, commit]
  )

  const isGrabbed = useCallback(
    (fieldId: string) => grabbedId === fieldId,
    [grabbedId]
  )

  const focusField = useCallback((fieldId: string) => {
    // Set the same focus target the commit path uses; the post-render effect
    // moves focus once this field's node ref is present. Selection/view changes
    // the caller makes alongside this drive the render that runs the effect.
    focusTargetRef.current = fieldId
  }, [])

  const addFromPalette = useCallback(
    (fieldType: EditorFieldType) => {
      const containerId = selectedContainerId(
        editor.state.fields,
        editor.selectedFieldId
      )
      const parentPath = findContainerPath(editor.state, containerId)
      if (parentPath === undefined) {
        return
      }
      const field = createField(fieldType)
      editor.addField(parentPath, field, null)
      setAnnouncement(`Added a ${fieldType} field.`)
      focusTargetRef.current = field.id
    },
    [editor]
  )

  return useMemo(
    () => ({
      move,
      announcement,
      isGrabbed,
      grab,
      handleGrabbedKey,
      registerNodeRef,
      focusField,
      addFromPalette,
    }),
    [
      move,
      announcement,
      isGrabbed,
      grab,
      handleGrabbedKey,
      registerNodeRef,
      focusField,
      addFromPalette,
    ]
  )
}

const KeyboardMoveContext = createContext<KeyboardMoveApi | null>(null)

/**
 * Provides the {@link KeyboardMoveApi} to the canvas subtree so nodes, the
 * palette, and the announcer share one keyboard-move state machine.
 */
export const KeyboardMoveProvider = KeyboardMoveContext.Provider

/**
 * Reads the {@link KeyboardMoveApi} from context.
 *
 * @returns The keyboard-move API.
 * @throws {Error} When used outside a {@link KeyboardMoveProvider}.
 */
export function useKeyboardMoveContext(): KeyboardMoveApi {
  const api = useContext(KeyboardMoveContext)
  if (api === null) {
    throw new Error(
      "useKeyboardMoveContext must be used within a KeyboardMoveProvider"
    )
  }
  return api
}
