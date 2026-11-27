import type { CanvasDragState } from "./use-canvas-dnd"

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
 * `beforeId`) from the live pointer drag, so a node or container zone renders
 * one indicator while a drag resolves to dropping at this slot.
 *
 * @param drag - The live pointer drag state, or `null` when no drag is active.
 * @param containerId - The container this slot belongs to (`null` = top level).
 * @param beforeId - The sibling this slot inserts before, or `null` to append.
 * @returns The {@link IndicatorState} for the slot.
 */
export function indicatorAt(
  drag: CanvasDragState | null,
  containerId: string | null,
  beforeId: string | null
): IndicatorState {
  const pointerHere =
    drag !== null &&
    drag.target !== null &&
    drag.target.containerId === containerId &&
    drag.target.beforeId === beforeId
  return { show: pointerHere, valid: drag?.plan?.ok ?? false }
}
