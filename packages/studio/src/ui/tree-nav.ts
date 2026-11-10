import type { EditorField, FieldPath } from "@/core"

/**
 * One row of the field tree flattened for keyboard navigation and ARIA.
 *
 * The field tree is rendered recursively, but a `role="tree"` with roving
 * tabindex needs a single linear order over the *visible* rows (collapsed
 * subtrees contribute nothing) so Arrow/Home/End can move focus deterministically
 * and `aria-level` can reflect nesting. This is that flattened view.
 */
export interface VisibleNode {
  /** The stable client-side id of the field this row renders. */
  id: string
  /** The field's path within the editor state (indices at each level). */
  path: FieldPath
  /** 1-based nesting depth, used directly as `aria-level`. */
  level: number
  /** Whether the node can hold children (`Object` / `Array`-of-`Object`). */
  expandable: boolean
  /** Whether an expandable node is currently expanded. */
  expanded: boolean
  /** The id of this node's parent, or `null` at the top level. */
  parentId: string | null
}

/**
 * Returns the child-field array a field exposes, or `undefined` for a field
 * that holds no structural children (a primitive, or an `Array` with a
 * primitive item). Shared by the renderer and the flattener so both agree on
 * what counts as a container.
 *
 * @param field - The field to inspect.
 * @returns Its child fields when it is a container, otherwise `undefined`.
 */
export function childrenOf(field: EditorField): EditorField[] | undefined {
  if (field.type === "Object") {
    return field.fields ?? []
  }
  if (field.type === "Array" && field.items?.type === "Object") {
    return field.items.fields ?? []
  }
  return undefined
}

/**
 * Flattens the field tree into the linear list of rows a screen-reader and the
 * roving-tabindex handler walk, honouring the current expansion state: a
 * collapsed container contributes its own row but none of its descendants.
 *
 * @param fields - The top-level editor fields.
 * @param isExpanded - Predicate telling whether a container id is expanded.
 * @returns The visible rows in document (top-to-bottom) order.
 */
export function flattenVisible(
  fields: EditorField[],
  isExpanded: (id: string) => boolean
): VisibleNode[] {
  const rows: VisibleNode[] = []

  const walk = (
    nodes: EditorField[],
    path: FieldPath,
    level: number,
    parentId: string | null
  ): void => {
    for (const [index, field] of nodes.entries()) {
      const children = childrenOf(field)
      const expandable = children !== undefined
      const expanded = expandable && isExpanded(field.id)
      rows.push({
        id: field.id,
        path: [...path, index],
        level,
        expandable,
        expanded,
        parentId,
      })
      if (expandable && expanded && children.length > 0) {
        walk(children, [...path, index], level + 1, field.id)
      }
    }
  }

  walk(fields, [], 1, null)
  return rows
}

/**
 * Computes the id that keyboard focus should move to for a tree navigation key,
 * following the WAI-ARIA tree pattern over the flattened visible rows.
 *
 * `ArrowRight` on a collapsed container is handled by the caller (it expands in
 * place); this function only reports the *focus* target, so `ArrowRight` here
 * means "an already-expanded container moves to its first child", and
 * `ArrowLeft` means "a leaf or collapsed node moves to its parent". The caller
 * decides expand/collapse vs. move based on the current node's state.
 *
 * @param rows - The flattened visible rows, in order.
 * @param currentId - The id of the currently focused row.
 * @param key - The navigation key pressed.
 * @returns The id to focus next, or `null` when focus should not move.
 */
/** The navigation keys {@link nextFocusId} understands. */
export type TreeNavKey =
  | "ArrowDown"
  | "ArrowUp"
  | "ArrowRight"
  | "ArrowLeft"
  | "Home"
  | "End"

/**
 * Resolves the focus target for a movement from a known row index, split out of
 * {@link nextFocusId} so each function stays within the project's complexity
 * budget. `index` is the current row's position (always valid here).
 */
function moveFromIndex(
  rows: VisibleNode[],
  index: number,
  key: "ArrowDown" | "ArrowUp" | "ArrowRight" | "ArrowLeft"
): string | null {
  const current = rows[index]
  if (current === undefined) {
    return null
  }

  if (key === "ArrowDown") {
    return rows.at(index + 1)?.id ?? current.id
  }
  if (key === "ArrowUp") {
    // Guard index 0 explicitly: `.at(-1)` would wrap to the last row.
    return index === 0 ? current.id : (rows.at(index - 1)?.id ?? current.id)
  }
  if (key === "ArrowRight") {
    // Only meaningful here when already expanded: move to the first child.
    return current.expandable && current.expanded
      ? (rows.at(index + 1)?.id ?? current.id)
      : null
  }
  // ArrowLeft: move to the parent (collapse-in-place is caller-handled).
  return current.parentId
}

export function nextFocusId(
  rows: VisibleNode[],
  currentId: string | null,
  key: TreeNavKey
): string | null {
  if (rows.length === 0) {
    return null
  }
  const first = rows.at(0)?.id ?? null

  if (key === "Home") {
    return first
  }
  if (key === "End") {
    return rows.at(-1)?.id ?? null
  }

  const index = rows.findIndex((row) => row.id === currentId)
  if (index === -1) {
    return first
  }
  return moveFromIndex(rows, index, key)
}
