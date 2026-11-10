import { Redo2Icon, Undo2Icon } from "lucide-react"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"

import { useEditorContext } from "./use-editor"

/**
 * Returns whether a keyboard event targets a text-entry control, so the global
 * undo/redo shortcut does not hijack a native input undo while the user is
 * typing a field name or metadata value.
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable
}

/**
 * On-screen undo/redo buttons wired to the `use-editor` history, plus the
 * standard keyboard shortcuts (`Ctrl/Cmd+Z` to undo, `Ctrl/Cmd+Shift+Z` or
 * `Ctrl/Cmd+Y` to redo). The buttons disable at the ends of history per
 * `canUndo`/`canRedo` and keep a visible focus ring, so undo/redo stays WCAG AA
 * operable (Requirement 5.1) even though drag is drag-primary.
 *
 * The shortcut listener ignores events originating from a text input so it does
 * not interfere with a native input undo during typing.
 */
export const UndoRedoControls = () => {
  const editor = useEditorContext()
  const { undo, redo, canUndo, canRedo } = editor

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) {
        return
      }
      const key = event.key.toLowerCase()
      const isRedo = (key === "z" && event.shiftKey) || key === "y"
      const isUndo = key === "z" && !event.shiftKey
      if (!isUndo && !isRedo) {
        return
      }
      if (isTextEntryTarget(event.target)) {
        return
      }
      event.preventDefault()
      if (isRedo) {
        if (canRedo) {
          redo()
        }
      } else if (canUndo) {
        undo()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [undo, redo, canUndo, canRedo])

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={() => undo()}
      >
        <Undo2Icon />
        Undo
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={() => redo()}
      >
        <Redo2Icon />
        Redo
      </Button>
    </div>
  )
}
