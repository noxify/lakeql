import type { EditorField, EditorFieldType, MoveTarget } from "@/core"

/**
 * The payload a palette source carries while it is dragged: the request to
 * create a brand-new field of the chosen type on drop.
 */
export interface NewFieldDragData {
  kind: "new-field"
  /** The field type the dropped palette source should create. */
  fieldType: EditorFieldType
}

/**
 * The payload a canvas node carries while it is dragged: the request to move
 * the existing field identified by its stable id.
 */
export interface MoveFieldDragData {
  kind: "move-field"
  /** The stable id of the field being moved. */
  fieldId: string
}

/**
 * The discriminated union of everything the canvas can drag. `@dnd-kit` carries
 * it on the active draggable's `data.current`.
 */
export type CanvasDragData = NewFieldDragData | MoveFieldDragData

/**
 * The payload a droppable container zone carries. Every `Object` and
 * `Array`-of-`Object` exposes one (plus the implicit top-level zone); an
 * `Array`-of-primitive never does, so a field can never nest into it.
 */
export interface ContainerZoneData {
  kind: "container-zone"
  /** The owning field id of the container, or `null` for the top level. */
  containerId: string | null
}

/**
 * The payload a sortable node drop-anchor carries. A drop landing on a node
 * resolves its `beforeId` to this id and its `containerId` to the node's
 * parent container.
 */
export interface NodeAnchorData {
  kind: "node-anchor"
  /** The stable id of the field this node renders. */
  fieldId: string
  /** The owning field id of this node's container, or `null` at the top. */
  containerId: string | null
}

/**
 * The discriminated union of everything the canvas can drop onto.
 */
export type CanvasDropData = ContainerZoneData | NodeAnchorData

/** The `@dnd-kit` droppable id of the top-level container zone. */
export const ROOT_ZONE_ID = "canvas-zone:root"

/**
 * Builds the stable `@dnd-kit` droppable id of a container zone from its owning
 * field id (or `null` for the top level).
 *
 * @param containerId - The container's owning-field id, or `null` for the top.
 * @returns The droppable id string used by the zone.
 */
export function zoneId(containerId: string | null): string {
  return containerId === null ? ROOT_ZONE_ID : `canvas-zone:${containerId}`
}

/**
 * Builds the stable `@dnd-kit` draggable id of a palette source from its field
 * type.
 *
 * @param fieldType - The field type the source creates.
 * @returns The draggable id string used by the palette source.
 */
export function paletteDraggableId(fieldType: EditorFieldType): string {
  return `canvas-palette:${fieldType}`
}

/**
 * The outcome of resolving a drag-over/drop event into a concrete drop
 * destination, or `null` when the event has no droppable under the pointer.
 */
export interface ResolvedDrop {
  /** The structural destination for `moveField`/`addField`. */
  target: MoveTarget
}

/**
 * Resolves the `MoveTarget` for a drop, given the drop data under the pointer.
 *
 * A drop landing on a node anchor resolves to that node's container with the
 * node as the `beforeId` insert anchor. A drop landing on a bare container zone
 * (its empty area) appends to that container (`beforeId: null`).
 *
 * @param over - The drop data under the pointer, or `null`/`undefined` when
 *   nothing droppable is under it.
 * @returns The resolved {@link MoveTarget}, or `null` when there is no valid
 *   droppable under the pointer.
 */
export function resolveDropTarget(
  over: CanvasDropData | null | undefined
): MoveTarget | null {
  if (over === null || over === undefined) {
    return null
  }
  if (over.kind === "node-anchor") {
    return { containerId: over.containerId, beforeId: over.fieldId }
  }
  return { containerId: over.containerId, beforeId: null }
}

/**
 * Returns whether a field holds a nested drop zone: `Object` and
 * `Array`-of-`Object` do; a primitive and an `Array`-of-primitive do not.
 *
 * @param field - The field to inspect.
 * @returns `true` when the field exposes a child container the canvas can drop
 *   into.
 */
export function isDropContainer(field: EditorField): boolean {
  if (field.type === "Object") {
    return true
  }
  return field.type === "Array" && field.items?.type === "Object"
}

/**
 * Returns the child fields a container field holds for rendering nested nodes,
 * or `undefined` when the field is not a drop container.
 *
 * @param field - The field to read children from.
 * @returns The child field array, or `undefined` for a non-container.
 */
export function containerChildren(
  field: EditorField
): EditorField[] | undefined {
  if (field.type === "Object") {
    return field.fields ?? []
  }
  if (field.type === "Array" && field.items?.type === "Object") {
    return field.items.fields ?? []
  }
  return undefined
}
