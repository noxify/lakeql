import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core"
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import type { MovePlan, MoveTarget } from "@/core"
import { createField, findContainerPath, planMove } from "@/core"

import { useEditorContext } from "../use-editor"
import type { CanvasDragData, CanvasDropData } from "./dnd-types"
import { resolveDropTarget } from "./dnd-types"

/**
 * The live drag state the canvas renders: what is being dragged, where it would
 * land, and whether the current hover is a valid drop. `null` when no drag is
 * in progress.
 */
export interface CanvasDragState {
  /** The payload of the active draggable. */
  active: CanvasDragData
  /**
   * The resolved destination under the pointer, or `null` when the pointer is
   * not over a droppable.
   */
  target: MoveTarget | null
  /**
   * The structural plan for the current hover. For a palette add this is
   * always `ok` once a container is under the pointer (a new field can nest
   * into any container); for a move it is the {@link planMove} result. `null`
   * when nothing droppable is under the pointer.
   */
  plan: MovePlan | null
}

/**
 * The canvas DnD API exposed to the palette, nodes, and drop indicator.
 */
export interface CanvasDndApi {
  /** The live drag state, or `null` when idle. */
  drag: CanvasDragState | null
  /** The last structurally-impossible drop reason, for surfacing to the user. */
  rejectionReason: string | null
  /** `@dnd-kit` drag-start handler: records the active draggable. */
  onDragStart: (event: DragStartEvent) => void
  /** `@dnd-kit` drag-over handler: recomputes the live drop plan. */
  onDragOver: (event: DragOverEvent) => void
  /** `@dnd-kit` drag-end handler: applies a valid drop through `use-editor`. */
  onDragEnd: (event: DragEndEvent) => void
}

/** Reads the `data.current` payload off a draggable/droppable, type-narrowed. */
function dragData(
  value: { data: { current?: unknown } } | null | undefined
): CanvasDragData | null {
  const current = value?.data.current as CanvasDragData | undefined
  return current ?? null
}

/** Reads the `data.current` payload off a droppable, type-narrowed. */
function dropData(
  value: { data: { current?: unknown } } | null | undefined
): CanvasDropData | null {
  const current = value?.data.current as CanvasDropData | undefined
  return current ?? null
}

/**
 * Computes the live drop plan for a hover: `planMove` for an existing field, or
 * a container-resolvability check for a new palette field (which can nest into
 * any field-holding container).
 */
function planFor(
  state: Parameters<typeof planMove>[0],
  active: CanvasDragData,
  target: MoveTarget | null
): MovePlan | null {
  if (target === null) {
    return null
  }
  if (active.kind === "move-field") {
    return planMove(state, active.fieldId, target)
  }
  // A palette add: the only structural requirement is that the destination is
  // a field-holding container (`findContainerPath` resolves it). `null` (top
  // level) always resolves.
  const resolved = findContainerPath(state, target.containerId)
  return resolved === undefined
    ? { ok: false, reason: "The destination is not a field-holding container." }
    : { ok: true }
}

/**
 * The canvas drag-and-drop controller: owns the live drag state and routes a
 * completed drop to the `use-editor` commit path (`addField` for a palette
 * source, `moveField` for a canvas node), committing exactly one snapshot per
 * drop.
 *
 * Structural validity is previewed on every drag-over via {@link planMove} (or
 * a container-resolvability check for a palette add). A structurally-impossible
 * drop makes no state change and surfaces a reason; a drop onto the dragged
 * field itself is a no-op (the core guards it).
 *
 * @returns The {@link CanvasDndApi} consumed by the `DndContext`, palette,
 *   nodes, and drop indicator.
 */
export function useCanvasDnd(): CanvasDndApi {
  const editor = useEditorContext()
  const [drag, setDrag] = useState<CanvasDragState | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)

  const onDragStart = useCallback((event: DragStartEvent) => {
    const active = dragData(event.active)
    if (active === null) {
      return
    }
    setRejectionReason(null)
    setDrag({ active, target: null, plan: null })
  }, [])

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const active = dragData(event.active)
      if (active === null) {
        return
      }
      const target = resolveDropTarget(dropData(event.over))
      const plan = planFor(editor.state, active, target)
      setDrag({ active, target, plan })
    },
    [editor.state]
  )

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const active = dragData(event.active)
      setDrag(null)
      if (active === null) {
        return
      }
      const target = resolveDropTarget(dropData(event.over))
      if (target === null) {
        return
      }
      const plan = planFor(editor.state, active, target)
      if (plan === null || !plan.ok) {
        setRejectionReason(plan?.reason ?? "This drop is not possible.")
        return
      }
      setRejectionReason(null)
      if (active.kind === "new-field") {
        const parentPath = findContainerPath(editor.state, target.containerId)
        if (parentPath === undefined) {
          return
        }
        editor.addField(
          parentPath,
          createField(active.fieldType),
          target.beforeId
        )
        return
      }
      editor.moveField(active.fieldId, target)
    },
    [editor]
  )

  return useMemo(
    () => ({ drag, rejectionReason, onDragStart, onDragOver, onDragEnd }),
    [drag, rejectionReason, onDragStart, onDragOver, onDragEnd]
  )
}

/**
 * Builds the `@dnd-kit` sensors for the canvas: a pointer sensor with a small
 * activation distance (so a click to select is not swallowed as a drag).
 *
 * No `KeyboardSensor` is registered: `@dnd-kit` keyboard drag parity is a
 * documented non-goal, and the dedicated "Move field" button plus
 * `use-keyboard-move` is the single supported keyboard path. Registering it
 * previously let Space/Enter on the grip start a genuine sortable keyboard drag
 * (the distorted "ghost"); dropping it removes that path at its source while
 * leaving pointer drag on the grip untouched.
 *
 * @returns The sensor descriptors passed to the `DndContext`.
 */
export function useCanvasSensors(): ReturnType<typeof useSensors> {
  const pointer = useSensor(PointerSensor, {
    activationConstraint: { distance: 4 },
  })
  return useSensors(pointer)
}

const CanvasDndContext = createContext<CanvasDndApi | null>(null)

/**
 * Provides the {@link CanvasDndApi} to the canvas subtree so nodes and the drop
 * indicator can read the live drag state without prop drilling.
 */
export const CanvasDndProvider = CanvasDndContext.Provider

/**
 * Reads the {@link CanvasDndApi} from context.
 *
 * @returns The canvas DnD API.
 * @throws {Error} When used outside a {@link CanvasDndProvider}.
 */
export function useCanvasDndContext(): CanvasDndApi {
  const api = useContext(CanvasDndContext)
  if (api === null) {
    throw new Error(
      "useCanvasDndContext must be used within a CanvasDndProvider"
    )
  }
  return api
}
