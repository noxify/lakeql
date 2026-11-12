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
 * Registers the global undo/redo keyboard shortcuts (`Ctrl/Cmd+Z` to undo,
 * `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` to redo) for the lifetime of the mounting
 * component.
 *
 * The listener is deliberately decoupled from the on-screen
 * {@link UndoRedoControls} buttons: those buttons live in the Fields view's
 * content-fixed toolbar, so binding the shortcut to them would scope keyboard
 * undo/redo to that one view. Mount this hook **once at the shell root**
 * instead, so the shortcut works on every view regardless of where (or whether)
 * the buttons render.
 *
 * Events originating from a text input are ignored so the shortcut does not
 * interfere with a native input undo during typing.
 */
export function useUndoRedoShortcuts(): void {
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
}

/**
 * On-screen undo/redo buttons wired to the `use-editor` history. The buttons
 * disable at the ends of history per `canUndo`/`canRedo` and keep a visible
 * focus ring, so undo/redo stays WCAG AA operable (Requirement 5.1) even though
 * drag is drag-primary.
 *
 * The keyboard shortcuts are **not** registered here — they live in
 * {@link useUndoRedoShortcuts}, mounted once at the shell root so they stay
 * global while these buttons are scoped to the Fields view's content-fixed
 * toolbar.
 */
export const UndoRedoControls = () => {
  const editor = useEditorContext()
  const { undo, redo, canUndo, canRedo } = editor

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
