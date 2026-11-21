import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import type { EditorField, EditorFieldType } from "@/core"
import { createField, findContainerPath, findFieldPath } from "@/core"

import { useEditorContext } from "../use-editor"

/**
 * The field-focus and keyboard palette-add API exposed to the palette, the
 * canvas nodes, the validations jump-to-field action, and the live-region
 * announcer.
 */
export interface FieldFocusApi {
  /** The message to announce in the live region for the latest action. */
  announcement: string
  /**
   * Registers the focusable element of a field node (its name input) so focus
   * can be moved to the field after it is added or jumped to (its DOM node is
   * replaced on re-render). Pass `null` to unregister on unmount.
   */
  registerNodeRef: (fieldId: string, element: HTMLElement | null) => void
  /**
   * Requests programmatic focus of the field carrying `fieldId`, used by
   * jump-to-field: it sets the internal focus target so the post-render effect
   * moves focus once that field's node ref is present. This drives focus alone
   * (no state mutation), so a caller pairs it with `selectField` to also select
   * the field. Harmless when `fieldId` names no current field — the effect
   * simply never finds a node to focus.
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

/**
 * The field-focus controller: adds a field from the palette by keyboard into
 * the selected container, and moves focus to a field's name input after it is
 * added or jumped to (from the Validations view). Focus is applied once the
 * target node has rendered, so unrelated re-renders never steal focus.
 *
 * It drives no new core mutation logic — palette-add reuses the same
 * `editor.addField` op the pointer drop path uses.
 *
 * @returns The {@link FieldFocusApi} consumed by the canvas subtree.
 */
export function useFieldFocus(): FieldFocusApi {
  const editor = useEditorContext()
  const [announcement, setAnnouncement] = useState("")

  // Focusable node elements, keyed by field id, for post-commit focus.
  const nodeRefs = useRef(new Map<string, HTMLElement>())
  // A field id to focus on the next render, consumed once.
  const focusTargetRef = useRef<string | null>(null)

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

  // Focus the target field once its node has rendered. Consumed once so
  // unrelated re-renders do not steal focus.
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

  const focusField = useCallback((fieldId: string) => {
    // The post-render effect moves focus once this field's node ref is present.
    // Selection/view changes the caller makes alongside this drive the render
    // that runs the effect.
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
    () => ({ announcement, registerNodeRef, focusField, addFromPalette }),
    [announcement, registerNodeRef, focusField, addFromPalette]
  )
}

const FieldFocusContext = createContext<FieldFocusApi | null>(null)

/**
 * Provides the {@link FieldFocusApi} to the canvas subtree so nodes, the
 * palette, and the announcer share one focus controller.
 */
export const FieldFocusProvider = FieldFocusContext.Provider

/**
 * Reads the {@link FieldFocusApi} from context.
 *
 * @returns The field-focus API.
 * @throws {Error} When used outside a {@link FieldFocusProvider}.
 */
export function useFieldFocusContext(): FieldFocusApi {
  const api = useContext(FieldFocusContext)
  if (api === null) {
    throw new Error(
      "useFieldFocusContext must be used within a FieldFocusProvider"
    )
  }
  return api
}
