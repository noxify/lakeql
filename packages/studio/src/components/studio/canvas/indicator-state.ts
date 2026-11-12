import type { CanvasDragState } from "./use-canvas-dnd"
import type { KeyboardMoveState } from "./use-keyboard-move"

/**
 * Whether a drop indicator should render at a given slot and, if so, whether
 * the slot is a structurally valid destination (driving the valid/invalid
 * tint).
 */
export interface IndicatorState {
  /** Whether the indicator renders at this slot. */
  show: boolean
  /** Whether the slot is a structurally valid drop for the active move. */
  valid: boolean
}

/**
 * Resolves the drop indicator for a specific insert slot (`containerId` +
 * `beforeId`) from the live pointer drag and keyboard-move states, so a node or
 * container zone renders one indicator driven by whichever interaction is
 * active.
 *
 * The keyboard move takes precedence when its cursor is on this slot (keyboard
 * and pointer moves are never active at the same time), otherwise the pointer
 * drag's resolved target is used. The indicator shows when either interaction
 * targets this slot; its `valid` tint comes from the active interaction's plan.
 *
 * @param drag - The live pointer drag state, or `null` when no drag is active.
 * @param move - The live keyboard-move state, or `null` when idle.
 * @param containerId - The container this slot belongs to (`null` = top level).
 * @param beforeId - The sibling this slot inserts before, or `null` to append.
 * @returns The {@link IndicatorState} for the slot.
 */
export function indicatorAt(
  drag: CanvasDragState | null,
  move: KeyboardMoveState | null,
  containerId: string | null,
  beforeId: string | null
): IndicatorState {
  const keyboardHere =
    move !== null &&
    move.slot.containerId === containerId &&
    move.slot.beforeId === beforeId
  if (keyboardHere) {
    return { show: true, valid: move.plan.ok }
  }
  const pointerHere =
    drag !== null &&
    drag.target !== null &&
    drag.target.containerId === containerId &&
    drag.target.beforeId === beforeId
  return { show: pointerHere, valid: drag?.plan?.ok ?? false }
}
