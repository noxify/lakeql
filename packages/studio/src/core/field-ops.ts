import type { FieldOptions } from "@lakeql/schema-generator/endpoint-schema"

import type {
  EditorArrayItem,
  EditorArrayItemType,
  EditorField,
  EditorFieldType,
  EditorState,
} from "./model"
import { createFieldId } from "./model"
import {
  collectFieldIds,
  isValidPartitionSource,
  partitionSegmentLabel,
  partitionSegmentsReferencing,
  removePartitionSegments,
} from "./partitioning"

/**
 * A location in the field tree, expressed as a path of child indices from the
 * root `fields` array.
 *
 * Each segment descends one level. An `Object` field's children live under its
 * `fields`; an `Array`-of-`Object` field's children live under its
 * `items.fields`. `FieldPath` addresses both uniformly: the resolver follows
 * whichever structural container the parent exposes. An empty path addresses
 * the top-level `fields` array itself.
 */
export type FieldPath = number[]

/**
 * Creates a fresh field of the given type with an empty name and no children,
 * ready to be configured by the user.
 *
 * @param type - The new field's type. Defaults to `String`.
 * @returns A new {@link EditorField} with a fresh client-side id.
 */
export function createField(type: EditorFieldType = "String"): EditorField {
  const field: EditorField = { id: createFieldId(), name: "", type }
  if (type === "Object") {
    field.fields = []
  } else if (type === "Array") {
    field.items = { type: "String" }
  }
  return field
}

/**
 * Returns the child-field array a field exposes, or `undefined` when the field
 * holds no structural children (a primitive, or an `Array` whose item is a
 * primitive).
 */
function childrenOf(field: EditorField): EditorField[] | undefined {
  if (field.type === "Object") {
    return field.fields
  }
  if (field.type === "Array" && field.items?.type === "Object") {
    return field.items.fields
  }
  return undefined
}

/**
 * Immutably replaces the child-field array a field exposes, returning a new
 * field. Used by the tree-rebuilding helpers.
 */
function withChildren(
  field: EditorField,
  children: EditorField[]
): EditorField {
  if (field.type === "Object") {
    return { ...field, fields: children }
  }
  if (field.type === "Array" && field.items?.type === "Object") {
    return { ...field, items: { ...field.items, fields: children } }
  }
  return field
}

/**
 * Rebuilds the tree by applying `transform` to the child array at `path`,
 * returning a new `fields` array. The input is never mutated.
 *
 * @throws {Error} When the path does not resolve to a container that holds
 *   fields.
 */
function updateFieldsAt(
  fields: EditorField[],
  path: FieldPath,
  transform: (children: EditorField[]) => EditorField[]
): EditorField[] {
  if (path.length === 0) {
    return transform(fields)
  }

  const [index, ...rest] = path
  return fields.map((field, i) => {
    if (i !== index) {
      return field
    }
    const children = childrenOf(field)
    if (children === undefined) {
      throw new Error(
        `Cannot descend into field "${field.name}" of type ${field.type}`
      )
    }
    return withChildren(field, updateFieldsAt(children, rest, transform))
  })
}

/**
 * Resolves the field addressed by `path` (the last index into the container at
 * the preceding path), following each level's structural child container.
 *
 * An empty path addresses no field (the top-level container itself), so it
 * returns `undefined`. A path segment that overruns a container — an index past
 * the end, or a descent into a field that holds no children — also returns
 * `undefined`.
 *
 * @param fields - The top-level field array to resolve against.
 * @param path - The child-index {@link FieldPath} to the field.
 * @returns The addressed {@link EditorField}, or `undefined` when the path does
 *   not resolve to one.
 */
export function fieldAt(
  fields: EditorField[],
  path: FieldPath
): EditorField | undefined {
  if (path.length === 0) {
    return undefined
  }
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
    currentFields = childrenOf(field)
  }
  return field
}

/**
 * Adds a field to the container addressed by `parentPath` (the empty path
 * targets the top-level `fields`).
 *
 * By default the field is appended as the last child. Passing a `beforeId`
 * inserts the field immediately before the sibling carrying that id, giving the
 * canvas a positional palette-drop. When `beforeId` is absent, `null`, or does
 * not match any sibling in the resolved container, the field is appended — the
 * original append behaviour is preserved, so callers that omit `beforeId` are
 * unaffected.
 *
 * @param state - The current editor state.
 * @param parentPath - Path to the container that receives the new field.
 * @param field - The field to add. Defaults to a fresh `String` field.
 * @param beforeId - Optional stable id of the sibling to insert before;
 *   appends when absent, `null`, or not found in the container.
 * @returns A new {@link EditorState}; the input is not mutated.
 */
export function addField(
  state: EditorState,
  parentPath: FieldPath,
  field: EditorField = createField(),
  beforeId: string | null = null
): EditorState {
  return {
    ...state,
    fields: updateFieldsAt(state.fields, parentPath, (children) =>
      insertBefore(children, field, beforeId)
    ),
  }
}

/**
 * Returns a new array with `field` inserted before the sibling carrying
 * `beforeId`, or appended when `beforeId` is `null` or not found.
 */
function insertBefore(
  children: EditorField[],
  field: EditorField,
  beforeId: string | null
): EditorField[] {
  if (beforeId === null) {
    return [...children, field]
  }
  const index = children.findIndex((child) => child.id === beforeId)
  if (index === -1) {
    return [...children, field]
  }
  return [...children.slice(0, index), field, ...children.slice(index)]
}

/**
 * Removes the field at `path` from its container, leaving partition segments
 * untouched. Shared by {@link removeField} and {@link moveField} (a move
 * re-inserts the same field, so its segments must survive).
 */
function removeFieldKeepingSegments(
  state: EditorState,
  path: FieldPath
): EditorState {
  if (path.length === 0) {
    throw new Error("removeField requires a non-empty path")
  }
  const parentPath = path.slice(0, -1)
  const index = path.at(-1) as number
  return {
    ...state,
    fields: updateFieldsAt(state.fields, parentPath, (children) =>
      children.filter((_, i) => i !== index)
    ),
  }
}

/**
 * The partition segments a field removal would take with it, for a
 * confirmation UI.
 */
export interface FieldRemovalPlan {
  /**
   * Display labels (for example `created_at → year`) of the partition segments
   * that reference the removed field or any field nested in it, in path order.
   * Empty when the removal affects no segment.
   */
  affectedPartitionSegments: string[]
}

/**
 * Dry-runs a field removal: names the partition segments that reference the
 * field at `path` (or a field nested beneath it) without changing anything.
 *
 * @param state - The current editor state.
 * @param path - Path to the field that would be removed. Must be non-empty.
 * @returns A {@link FieldRemovalPlan}; an unresolvable path has no segments.
 */
export function planFieldRemoval(
  state: EditorState,
  path: FieldPath
): FieldRemovalPlan {
  const field = fieldAt(state.fields, path)
  if (field === undefined) {
    return { affectedPartitionSegments: [] }
  }
  const ids = new Set(collectFieldIds(field))
  return {
    affectedPartitionSegments: partitionSegmentsReferencing(state, ids).map(
      (segment) => partitionSegmentLabel(segment, state.fields)
    ),
  }
}

/**
 * Removes the field addressed by `path` from its container at any nesting
 * level, together with any partition segments that reference it (or a field
 * nested beneath it). Other segments stay; a by-field selection left with no
 * segment is empty. The result is one state, so one history snapshot reverts
 * both the field and its segments.
 *
 * @param state - The current editor state.
 * @param path - Path to the field to remove. Must be non-empty.
 * @returns A new {@link EditorState}; the input is not mutated.
 * @throws {Error} When `path` is empty.
 */
export function removeField(state: EditorState, path: FieldPath): EditorState {
  const field = fieldAt(state.fields, path)
  const removed = removeFieldKeepingSegments(state, path)
  return field === undefined
    ? removed
    : removePartitionSegments(removed, new Set(collectFieldIds(field)))
}

/**
 * Renames the field addressed by `path`, preserving its type, structural
 * children, and options.
 *
 * A field `name` is valid for every type and never touches structure, so this
 * is the pure-core counterpart of a continuous (coalesced) text edit: the UI
 * routes name edits through here rather than re-walking the tree itself, so all
 * field mutation stays in one place.
 *
 * @param state - The current editor state.
 * @param path - Path to the field to rename. Must be non-empty.
 * @param name - The new field name (may be empty while the user is typing).
 * @returns A new {@link EditorState}; the input is not mutated.
 * @throws {Error} When `path` is empty.
 */
export function renameField(
  state: EditorState,
  path: FieldPath,
  name: string
): EditorState {
  if (path.length === 0) {
    throw new Error("renameField requires a non-empty path")
  }
  const parentPath = path.slice(0, -1)
  const index = path.at(-1) as number
  return {
    ...state,
    fields: updateFieldsAt(state.fields, parentPath, (children) =>
      children.map((child, i) => (i === index ? { ...child, name } : child))
    ),
  }
}

/**
 * Sets (or clears) the `options` of the field addressed by `path`.
 *
 * Passing `undefined` removes the `options` key entirely. The mapping layer
 * already omits empty options on export, but clearing here keeps the live state
 * tidy and makes "no options set" explicit. `name`, `type`, and structural
 * children are untouched.
 *
 * @param state - The current editor state.
 * @param path - Path to the field whose options are set. Must be non-empty.
 * @param options - The new options, or `undefined` to clear them.
 * @returns A new {@link EditorState}; the input is not mutated.
 * @throws {Error} When `path` is empty.
 */
export function setFieldOptions(
  state: EditorState,
  path: FieldPath,
  options: FieldOptions | undefined
): EditorState {
  if (path.length === 0) {
    throw new Error("setFieldOptions requires a non-empty path")
  }
  const parentPath = path.slice(0, -1)
  const index = path.at(-1) as number
  return {
    ...state,
    fields: updateFieldsAt(state.fields, parentPath, (children) =>
      children.map((child, i) => {
        if (i !== index) {
          return child
        }
        if (options === undefined) {
          const { options: _dropped, ...rest } = child
          return rest
        }
        return { ...child, options }
      })
    ),
  }
}

/**
 * Finds the path to the field carrying `fieldId`, searching the whole tree
 * (top-level fields, `Object` children, and `Array`-of-`Object` item children).
 *
 * Returns `undefined` when no field has that id — for example when the selected
 * field was just removed. Lets a panel that holds only a field `id` (selection)
 * resolve the path the field ops require.
 *
 * @param fields - The top-level field array to search.
 * @param fieldId - The client-side id to locate.
 * @returns The {@link FieldPath} to the field, or `undefined` when not found.
 */
export function findFieldPath(
  fields: EditorField[],
  fieldId: string
): FieldPath | undefined {
  for (const [index, field] of fields.entries()) {
    if (field.id === fieldId) {
      return [index]
    }
    const children =
      field.type === "Object"
        ? field.fields
        : field.type === "Array" && field.items?.type === "Object"
          ? field.items.fields
          : undefined
    if (children !== undefined) {
      const nested = findFieldPath(children, fieldId)
      if (nested !== undefined) {
        return [index, ...nested]
      }
    }
  }
  return undefined
}

/**
 * Resolves a `fieldId` to the ancestry of field **names** leading to it, from
 * the top level down to (and including) the field itself.
 *
 * {@link findFieldPath} yields a path of numeric child **indices**, which the
 * mutation ops consume but which carries no human-readable labels. This walk
 * turns that index path into the list of names a UI can render as a
 * breadcrumb — e.g. a `postalCode` field nested in an `address` `Object`
 * resolves to `["address", "postalCode"]`, and an item field of an
 * `Array`-of-`Object` resolves to the array's name followed by the item
 * field's name. A field with an empty `name` contributes an empty string at its
 * position (the caller decides how to render an unnamed field), and the walk
 * never fabricates names.
 *
 * Returns `undefined` when no field carries `fieldId` (for example a stale
 * selection after the field was removed), distinguishing "unknown field" from a
 * resolved field whose own name happens to be empty.
 *
 * Pure and React-free.
 *
 * @param state - The editor state to resolve against.
 * @param fieldId - The client-side id to resolve to a name ancestry.
 * @returns The ancestry of field names from the top level to the field, or
 *   `undefined` when no field has that id.
 */
export function fieldNamePath(
  state: EditorState,
  fieldId: string
): string[] | undefined {
  const path = findFieldPath(state.fields, fieldId)
  if (path === undefined) {
    return undefined
  }
  const names: string[] = []
  // Walk the index path from the top level down, collecting the name at each
  // level by resolving the field addressed by each path prefix.
  for (let depth = 1; depth <= path.length; depth += 1) {
    const field = fieldAt(state.fields, path.slice(0, depth))
    if (field === undefined) {
      return undefined
    }
    names.push(field.name)
  }
  return names
}

/**
 * Resolves a container id to the {@link FieldPath} of the child-field array it
 * owns, mirroring {@link findFieldPath}.
 *
 * The canvas addresses drop targets by the stable id of the container's owning
 * field (or `null` for the top level), but the field ops take a `FieldPath`.
 * This resolver bridges the two: `null` maps to the empty path (the top-level
 * `fields`); a field id maps to the path of that field's child container — an
 * `Object`'s `fields`, or an `Array`-of-`Object`'s item `fields`. A field that
 * holds no child-field array (a primitive, or an `Array` of primitive) is not a
 * container, so its id resolves to `undefined`.
 *
 * @param state - The editor state to resolve against.
 * @param containerId - The container's owning-field id, or `null` for the top
 *   level.
 * @returns The {@link FieldPath} of the container's child array, or `undefined`
 *   when `containerId` is unknown or does not name a field-holding container.
 */
export function findContainerPath(
  state: EditorState,
  containerId: string | null
): FieldPath | undefined {
  if (containerId === null) {
    return []
  }
  const path = findFieldPath(state.fields, containerId)
  if (path === undefined) {
    return undefined
  }
  const field = fieldAt(state.fields, path)
  if (field === undefined || childrenOf(field) === undefined) {
    return undefined
  }
  return path
}

/**
 * The destination of a move, addressed by stable field ids rather than index
 * paths (which shift when the source is removed).
 */
export interface MoveTarget {
  /**
   * The destination container, identified by the stable id of its owning field,
   * or `null` for the top-level `fields` array. For an `Array`-of-`Object`
   * container this is the `Array` field's id (its item `fields`).
   */
  containerId: string | null
  /**
   * The stable id of the sibling to drop before, or `null` to append. The
   * insert position is resolved relative to this anchor, not a raw index.
   */
  beforeId: string | null
}

/**
 * The result of validating a proposed move against the schema's structural
 * rules.
 *
 * A structurally-impossible move has `ok: false` with a `reason`. A permitted
 * move has `ok: true`; `reason` may still carry a soft warning for a
 * schema-invalid-but-representable result (an emptied source container, a
 * duplicate name) that the validity gate will flag but that is not blocked.
 */
export interface MovePlan {
  /** Whether the move is structurally possible and may be applied. */
  ok: boolean
  /**
   * Why a move is rejected (`ok: false`), or a soft warning on an allowed move
   * (`ok: true`) whose result is schema-invalid-but-representable.
   */
  reason?: string
}

/**
 * Returns whether the subtree rooted at `field` contains a field with
 * `targetId` (at any depth), used for the self-containment check.
 */
function subtreeContainsId(field: EditorField, targetId: string): boolean {
  const children = childrenOf(field)
  if (children === undefined) {
    return false
  }
  for (const child of children) {
    if (child.id === targetId) {
      return true
    }
    if (subtreeContainsId(child, targetId)) {
      return true
    }
  }
  return false
}

/**
 * Validates a proposed move of the field `fromId` to `to`, without mutating.
 *
 * Rejects (`ok: false`) only structurally-impossible moves: a destination that
 * is not a field-holding container, a move that would place an `Array`'s items
 * under another `Array` (`Array`-of-`Array`), or self-containment — the
 * destination container is the moved field itself or lies inside its own
 * subtree. Allows (`ok: true`) moves whose result is merely
 * schema-invalid-but-representable — emptying the source container below its
 * `min(1)`, or creating a duplicate name — surfacing each as a soft `reason`
 * rather than blocking, consistent with how the editor already tolerates such
 * transient-invalid states. Dropping a field onto itself (`beforeId === fromId`)
 * is a permitted no-op.
 *
 * @param state - The editor state the move is evaluated against.
 * @param fromId - The stable id of the field being moved.
 * @param to - The destination container and insert anchor.
 * @returns A {@link MovePlan} describing whether the move may be applied and
 *   any soft warning.
 */
export function planMove(
  state: EditorState,
  fromId: string,
  to: MoveTarget
): MovePlan {
  // Drop onto itself: a permitted no-op, regardless of container.
  if (to.beforeId === fromId) {
    return { ok: true }
  }

  const sourcePath = findFieldPath(state.fields, fromId)
  if (sourcePath === undefined) {
    return { ok: false, reason: "The field to move no longer exists." }
  }
  const sourceField = fieldAt(state.fields, sourcePath)
  if (sourceField === undefined) {
    return { ok: false, reason: "The field to move no longer exists." }
  }

  // Self-containment: a container cannot move into itself or its descendants.
  if (to.containerId === fromId) {
    return { ok: false, reason: "A field cannot be moved into itself." }
  }
  if (
    to.containerId !== null &&
    subtreeContainsId(sourceField, to.containerId)
  ) {
    return {
      ok: false,
      reason: "A field cannot be moved into one of its own descendants.",
    }
  }

  // Destination must be a field-holding container (top level, Object, or
  // Array-of-Object). `null` is the top-level fields array.
  if (to.containerId !== null) {
    const containerField = fieldAt(
      state.fields,
      findFieldPath(state.fields, to.containerId) ?? []
    )
    if (containerField === undefined) {
      return {
        ok: false,
        reason: "The destination container no longer exists.",
      }
    }
    const containerChildren = childrenOf(containerField)
    if (containerChildren === undefined) {
      return {
        ok: false,
        reason: "The destination is not a field-holding container.",
      }
    }
    // Array-items-would-become-Array: an Array field cannot become the item of
    // an Array-of-Object container (the schema forbids Array of Array).
    if (containerField.type === "Array" && sourceField.type === "Array") {
      return {
        ok: false,
        reason: "An array's items cannot themselves be an array.",
      }
    }
  }

  // Allowed-but-schema-invalid soft warnings. These never block the move.
  const warning = moveWarning(state, sourcePath, sourceField, to)
  return warning === undefined ? { ok: true } : { ok: true, reason: warning }
}

/**
 * Computes a soft warning for an allowed move: emptying the source container
 * below its required `min(1)`, or creating a duplicate name at the destination.
 * Returns `undefined` when the move raises no such concern.
 */
function moveWarning(
  state: EditorState,
  sourcePath: FieldPath,
  sourceField: EditorField,
  to: MoveTarget
): string | undefined {
  const sourceParentPath = sourcePath.slice(0, -1)
  // Resolve the destination container once; both the emptied-source and the
  // duplicate-name checks reuse it.
  const destPath = findContainerPath(state, to.containerId)
  const movingWithinSameContainer =
    destPath?.join(",") === sourceParentPath.join(",")

  // Emptied source: the source's container drops to zero children, but only
  // when the move actually leaves that container (a within-container reorder
  // keeps the count).
  if (!movingWithinSameContainer && sourceParentPath.length > 0) {
    const sourceContainer = fieldAt(state.fields, sourceParentPath)
    const siblings =
      sourceContainer === undefined ? undefined : childrenOf(sourceContainer)
    if (siblings !== undefined && siblings.length <= 1) {
      return "Moving this field empties its source container, which the schema requires to be non-empty."
    }
  }

  // Duplicate name at the destination.
  if (destPath !== undefined) {
    const destSiblings = destSiblingsExcludingSource(
      state,
      destPath,
      sourceField.id
    )
    if (
      sourceField.name !== "" &&
      destSiblings.some((sibling) => sibling.name === sourceField.name)
    ) {
      return "The destination already has a field with this name."
    }
  }
  return undefined
}

/**
 * Resolves the siblings in the destination container, excluding the field being
 * moved (so a within-container reorder does not flag the field against itself).
 */
function destSiblingsExcludingSource(
  state: EditorState,
  destPath: FieldPath,
  sourceId: string
): EditorField[] {
  if (destPath.length === 0) {
    return state.fields.filter((field) => field.id !== sourceId)
  }
  const container = fieldAt(state.fields, destPath)
  const children = container === undefined ? undefined : childrenOf(container)
  return (children ?? []).filter((field) => field.id !== sourceId)
}

/**
 * Moves the field `fromId` into `to`, as a pure remove-then-insert addressed by
 * stable id.
 *
 * The source is located and removed first, then the destination container and
 * the insert anchor are resolved **in the post-removal state** — so a
 * cross-level move lands in the intended container even though removing the
 * source shifts the indices of its later siblings and shared ancestors. The
 * returned state is never mutated in place and no history snapshot is committed:
 * snapshot ownership lives in the `use-editor` layer (one commit per completed
 * drop). Dropping a field onto itself (`beforeId === fromId`) returns the state
 * unchanged.
 *
 * Callers are expected to gate with {@link planMove}; a structurally-impossible
 * move that reaches here (an unknown/invalid destination) returns the state
 * unchanged rather than throwing.
 *
 * @param state - The current editor state.
 * @param fromId - The stable id of the field to move.
 * @param to - The destination container and insert anchor.
 * @returns A new {@link EditorState}; the input is not mutated.
 */
export function moveField(
  state: EditorState,
  fromId: string,
  to: MoveTarget
): EditorState {
  // Drop onto itself: no-op.
  if (to.beforeId === fromId) {
    return state
  }

  const sourcePath = findFieldPath(state.fields, fromId)
  if (sourcePath === undefined) {
    return state
  }
  const sourceField = fieldAt(state.fields, sourcePath)
  if (sourceField === undefined) {
    return state
  }

  // Remove the source first, then resolve the destination against the
  // post-removal state so ids map to the correct (shifted) positions.
  const removed = removeFieldKeepingSegments(state, sourcePath)

  const destPath = findContainerPath(removed, to.containerId)
  if (destPath === undefined) {
    // Destination is not a resolvable container post-removal; leave unchanged.
    return state
  }

  return {
    ...removed,
    fields: updateFieldsAt(removed.fields, destPath, (children) =>
      insertBefore(children, sourceField, to.beforeId)
    ),
  }
}

/**
 * A candidate insert position for a keyboard-driven move, addressed by stable
 * ids rather than an index path (the same addressing {@link MoveTarget} uses).
 *
 * A slot names a container and an insert anchor: `containerId` is the owning
 * field id of the destination container (or `null` for the top level), and
 * `beforeId` is the stable id of the sibling to insert before, or `null` to
 * append at the end of that container.
 */
export interface MoveSlot {
  /**
   * The destination container, identified by the stable id of its owning field,
   * or `null` for the top-level `fields` array.
   */
  containerId: string | null
  /**
   * The stable id of the sibling to insert before, or `null` to append at the
   * end of the container.
   */
  beforeId: string | null
}

/**
 * Enumerates every valid insert position in the field tree, in DOM/reading
 * order, as a flat list of {@link MoveSlot}s a keyboard move can step through.
 *
 * For each field-holding container — the top level and every `Object` /
 * `Array`-of-`Object`, visited depth-first — the walk yields one slot before
 * each child (`beforeId` = that child's id) plus a trailing append slot
 * (`beforeId` = `null`). A container's own slots are emitted at the point it is
 * reached, and its children's slots immediately after, so the order matches the
 * nested reading order the canvas renders. A primitive and an
 * `Array`-of-primitive hold no children (`childrenOf` returns `undefined` — the
 * same predicate the drop logic's `isDropContainer`/`containerChildren` use), so
 * they contribute no inner slot.
 *
 * The result is a superset of legal destinations: it is purely structural
 * (reachable insert positions) and does not itself reject self-containment or
 * other move rules. The keyboard mode gates each slot with {@link planMove} for
 * a specific moved field, so a slot that would be self-containing for that field
 * is filtered at navigation time, not here. Every emitted slot is a resolvable
 * container position, so {@link planMove} accepts it for any trivially movable
 * field.
 *
 * Pure and React-free.
 *
 * @param state - The editor state whose insert positions are enumerated.
 * @returns The ordered list of candidate insert slots across the whole tree.
 */
export function enumerateMoveSlots(state: EditorState): MoveSlot[] {
  const slots: MoveSlot[] = []

  const walk = (fields: EditorField[], containerId: string | null): void => {
    for (const field of fields) {
      slots.push({ containerId, beforeId: field.id })
      const children = childrenOf(field)
      if (children !== undefined) {
        walk(children, field.id)
      }
    }
    slots.push({ containerId, beforeId: null })
  }

  walk(state.fields, null)
  return slots
}

/**
 * The result of a type change computed as a dry run.
 *
 * `needsConfirmation` is `true` exactly when the transition is lossy — the
 * target type cannot hold the source's structural children, so applying it
 * would drop authored `fields`/`items`. `name` and `options` are always
 * preserved and never cause a prompt. `lostDescription` names what would be
 * discarded, for a confirmation UI (built in a later phase).
 */
export interface TypeChangePlan {
  /**
   * Whether applying the change needs confirmation: it would discard
   * structural children or remove partition segments.
   */
  needsConfirmation: boolean
  /** Human-readable summary of what a lossy change would drop. */
  lostDescription?: string
  /**
   * Display labels of the partition segments the change would remove because
   * the retyped field stops being a valid partition source. Present only when
   * non-empty.
   */
  affectedPartitionSegments?: string[]
}

/**
 * Describes the structural children a field currently holds, for loss
 * reporting.
 */
function describeChildren(field: EditorField): string | undefined {
  if (field.type === "Object") {
    const count = field.fields?.length ?? 0
    return count > 0 ? `${count} child field(s)` : undefined
  }
  if (field.type === "Array") {
    if (field.items?.type === "Object") {
      const count = field.items.fields?.length ?? 0
      return `the array's object item${count > 0 ? ` (${count} child field(s))` : ""}`
    }
    return "the array's item type"
  }
  return undefined
}

/**
 * Determines whether changing a field from its current type to `nextType` is
 * lossy, and what would be lost, without applying the change.
 *
 * Loss rules (per the design's transition matrix): `name` and `options` are
 * always preserved. Structural children are dropped only when the target cannot
 * hold them — `Object` → anything but `Object`, and `Array` → anything but
 * `Array`. `Object` → `Object` and `Array` → `Array` preserve children;
 * primitive → anything is never lossy.
 *
 * A change also needs confirmation when the field is referenced by a partition
 * segment that the new type invalidates (`Object`/`Array`, or a date component
 * on a non-date type); the plan names those segments and applying the change
 * removes exactly them. This part only applies when `state` is given.
 *
 * @param field - The field whose type would change.
 * @param nextType - The target field type.
 * @param state - The editor state, used to find the partition segments that
 *   reference `field`. Omit to ignore partitioning.
 * @returns A {@link TypeChangePlan} describing confirmation need and loss.
 */
export function planTypeChange(
  field: EditorField,
  nextType: EditorFieldType,
  state?: EditorState
): TypeChangePlan {
  if (field.type === nextType) {
    return { needsConfirmation: false }
  }

  const losesObjectFields =
    field.type === "Object" && (field.fields?.length ?? 0) > 0
  const losesArrayItems = field.type === "Array" && field.items !== undefined
  const lostStructure = losesObjectFields || losesArrayItems
  const affected = affectedSegmentsOfRetype(field, nextType, state)

  if (!lostStructure && affected.length === 0) {
    return { needsConfirmation: false }
  }

  const parts: string[] = []
  const children = lostStructure ? describeChildren(field) : undefined
  if (children !== undefined) {
    parts.push(children)
  }
  if (affected.length > 0) {
    parts.push(
      `the partition ${affected.length === 1 ? "segment" : "segments"} ${affected.join(", ")}`
    )
  }
  return {
    needsConfirmation: true,
    ...(parts.length === 0 ? {} : { lostDescription: parts.join(" and ") }),
    ...(affected.length === 0 ? {} : { affectedPartitionSegments: affected }),
  }
}

/**
 * Labels the partition segments that reference `field` and are valid for its
 * current type but would become invalid for `nextType`. Empty without a state
 * or when the partitioning does not reference the field.
 */
function affectedSegmentsOfRetype(
  field: EditorField,
  nextType: EditorFieldType,
  state: EditorState | undefined
): string[] {
  if (state === undefined) {
    return []
  }
  return partitionSegmentsReferencing(state, new Set([field.id]))
    .filter(
      (segment) =>
        isValidPartitionSource(field.type, segment.component) &&
        !isValidPartitionSource(nextType, segment.component)
    )
    .map((segment) => partitionSegmentLabel(segment, state.fields))
}

/**
 * Builds the post-transition field for a type change, preserving `name` and
 * `options` and seeding fresh structural containers for the target type.
 */
function retypeField(
  field: EditorField,
  nextType: EditorFieldType
): EditorField {
  const base: EditorField = {
    id: field.id,
    name: field.name,
    type: nextType,
    ...(field.options === undefined ? {} : { options: field.options }),
  }

  if (nextType === "Object") {
    // Object → Object preserves children; any other source starts empty.
    base.fields = field.type === "Object" ? (field.fields ?? []) : []
  } else if (nextType === "Array") {
    // Array → Array preserves items; any other source starts with a primitive
    // item the user then refines.
    base.items =
      field.type === "Array" && field.items !== undefined
        ? field.items
        : { type: "String" }
  }

  return base
}

/**
 * Removes the partition segments of `field` that become invalid for `nextType`
 * (see {@link affectedSegmentsOfRetype}), leaving every other segment.
 */
function removeInvalidatedSegments(
  state: EditorState,
  field: EditorField,
  nextType: EditorFieldType
): EditorState {
  const { mutation } = state
  if (!mutation.enabled || mutation.partitioning === false) {
    return state
  }
  const kept = mutation.partitioning.filter(
    (segment) =>
      !(
        "fieldId" in segment &&
        segment.fieldId === field.id &&
        isValidPartitionSource(field.type, segment.component) &&
        !isValidPartitionSource(nextType, segment.component)
      )
  )
  return kept.length === mutation.partitioning.length
    ? state
    : { ...state, mutation: { ...mutation, partitioning: kept } }
}

/**
 * Changes the type of the field addressed by `path`.
 *
 * By default a lossy transition is refused and reported: the caller inspects
 * the returned {@link planTypeChange} result and re-invokes with
 * `confirm: true` once the user accepts. A no-loss transition applies directly.
 *
 * @param state - The current editor state.
 * @param path - Path to the field whose type changes. Must be non-empty.
 * @param nextType - The target type.
 * @param options - Pass `confirm: true` to apply a lossy transition.
 * @returns An object with the dry-run `plan`, whether the change was `applied`,
 *   and the resulting `state` (unchanged when a lossy change was not
 *   confirmed).
 * @throws {Error} When `path` does not resolve to a field.
 */
export function changeFieldType(
  state: EditorState,
  path: FieldPath,
  nextType: EditorFieldType,
  options: { confirm?: boolean } = {}
): { plan: TypeChangePlan; applied: boolean; state: EditorState } {
  const field = fieldAt(state.fields, path)
  if (field === undefined) {
    throw new Error("changeFieldType: path does not resolve to a field")
  }

  const plan = planTypeChange(field, nextType, state)

  if (plan.needsConfirmation && options.confirm !== true) {
    return { plan, applied: false, state }
  }

  const parentPath = path.slice(0, -1)
  const index = path.at(-1) as number
  const retyped: EditorState = {
    ...state,
    fields: updateFieldsAt(state.fields, parentPath, (children) =>
      children.map((child, i) =>
        i === index ? retypeField(child, nextType) : child
      )
    ),
  }
  // Drop exactly the segments the new type invalidates, in the same state so
  // one history snapshot covers both.
  const nextState = removeInvalidatedSegments(retyped, field, nextType)
  return { plan, applied: true, state: nextState }
}

/**
 * The result of planning an array item-type change (for example
 * `Array<Object>` → `Array<String>`), by analogy with {@link planTypeChange}.
 */
export function planArrayItemTypeChange(
  item: EditorArrayItem,
  nextType: EditorArrayItemType
): TypeChangePlan {
  if (item.type === nextType) {
    return { needsConfirmation: false }
  }
  if (item.type === "Object" && (item.fields?.length ?? 0) > 0) {
    const count = item.fields?.length ?? 0
    return {
      needsConfirmation: true,
      lostDescription: `the item's ${count} child field(s)`,
    }
  }
  return { needsConfirmation: false }
}

/**
 * Builds the post-transition item for an array item-type change, seeding fresh
 * `Object` children when switching to `Object`.
 */
function retypeArrayItem(
  item: EditorArrayItem,
  nextType: EditorArrayItemType
): EditorArrayItem {
  if (nextType === "Object") {
    return {
      type: "Object",
      fields: item.type === "Object" ? (item.fields ?? []) : [],
    }
  }
  return { type: nextType }
}

/**
 * Changes the item type of the `Array` field addressed by `path`, following the
 * same confirm-on-loss protocol as {@link changeFieldType}. A lossy transition
 * (`Array<Object>` with children → a primitive item) is refused unless
 * `confirm: true`.
 *
 * @param state - The current editor state.
 * @param path - Path to the `Array` field. Must be non-empty.
 * @param nextType - The target item type.
 * @param options - Pass `confirm: true` to apply a lossy transition.
 * @returns The dry-run `plan`, whether the change was `applied`, and the
 *   resulting `state`.
 * @throws {Error} When `path` does not resolve to an `Array` field.
 */
export function changeArrayItemType(
  state: EditorState,
  path: FieldPath,
  nextType: EditorArrayItemType,
  options: { confirm?: boolean } = {}
): { plan: TypeChangePlan; applied: boolean; state: EditorState } {
  const field = fieldAt(state.fields, path)
  if (field === undefined || field.type !== "Array") {
    throw new Error("changeArrayItemType: path does not resolve to an Array")
  }
  const item = field.items ?? { type: "String" }
  const plan = planArrayItemTypeChange(item, nextType)

  if (plan.needsConfirmation && options.confirm !== true) {
    return { plan, applied: false, state }
  }

  const parentPath = path.slice(0, -1)
  const index = path.at(-1) as number
  const nextState: EditorState = {
    ...state,
    fields: updateFieldsAt(state.fields, parentPath, (children) =>
      children.map((child, i) =>
        i === index
          ? { ...child, items: retypeArrayItem(item, nextType) }
          : child
      )
    ),
  }
  return { plan, applied: true, state: nextState }
}
