import type {
  EditorArrayItem,
  EditorArrayItemType,
  EditorField,
  EditorFieldType,
  EditorState,
} from "./model"
import { createFieldId } from "./model"

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
 * the preceding path).
 */
function fieldAt(
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
 * Adds a field as the last child of the container addressed by `parentPath`
 * (the empty path targets the top-level `fields`).
 *
 * @param state - The current editor state.
 * @param parentPath - Path to the container that receives the new field.
 * @param field - The field to add. Defaults to a fresh `String` field.
 * @returns A new {@link EditorState}; the input is not mutated.
 */
export function addField(
  state: EditorState,
  parentPath: FieldPath,
  field: EditorField = createField()
): EditorState {
  return {
    ...state,
    fields: updateFieldsAt(state.fields, parentPath, (children) => [
      ...children,
      field,
    ]),
  }
}

/**
 * Removes the field addressed by `path` from its container at any nesting
 * level.
 *
 * @param state - The current editor state.
 * @param path - Path to the field to remove. Must be non-empty.
 * @returns A new {@link EditorState}; the input is not mutated.
 * @throws {Error} When `path` is empty.
 */
export function removeField(state: EditorState, path: FieldPath): EditorState {
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
 * The result of a type change computed as a dry run.
 *
 * `needsConfirmation` is `true` exactly when the transition is lossy — the
 * target type cannot hold the source's structural children, so applying it
 * would drop authored `fields`/`items`. `name` and `options` are always
 * preserved and never cause a prompt. `lostDescription` names what would be
 * discarded, for a confirmation UI (built in a later phase).
 */
export interface TypeChangePlan {
  /** Whether applying the change would discard structural children. */
  needsConfirmation: boolean
  /** Human-readable summary of what a lossy change would drop. */
  lostDescription?: string
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
 * @param field - The field whose type would change.
 * @param nextType - The target field type.
 * @returns A {@link TypeChangePlan} describing confirmation need and loss.
 */
export function planTypeChange(
  field: EditorField,
  nextType: EditorFieldType
): TypeChangePlan {
  if (field.type === nextType) {
    return { needsConfirmation: false }
  }

  const losesObjectFields =
    field.type === "Object" && (field.fields?.length ?? 0) > 0
  const losesArrayItems = field.type === "Array" && field.items !== undefined

  if (losesObjectFields || losesArrayItems) {
    const description = describeChildren(field)
    return {
      needsConfirmation: true,
      ...(description === undefined ? {} : { lostDescription: description }),
    }
  }

  return { needsConfirmation: false }
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

  const plan = planTypeChange(field, nextType)

  if (plan.needsConfirmation && options.confirm !== true) {
    return { plan, applied: false, state }
  }

  const parentPath = path.slice(0, -1)
  const index = path.at(-1) as number
  const nextState: EditorState = {
    ...state,
    fields: updateFieldsAt(state.fields, parentPath, (children) =>
      children.map((child, i) =>
        i === index ? retypeField(child, nextType) : child
      )
    ),
  }
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
