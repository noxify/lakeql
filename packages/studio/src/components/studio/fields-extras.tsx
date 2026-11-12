import { KeyboardIcon, UploadIcon } from "lucide-react"
import { useRef } from "react"

import { Button } from "@/components/ui/button"

import { useEditorContext } from "./use-editor"

/**
 * An import affordance for the empty state: a labelled button driving a hidden
 * file input through the editor's no-partial-apply importer, so a new user can
 * start from an existing `endpoint.json` without leaving the canvas area. It
 * mirrors the header Import control's behaviour but is reachable from the empty
 * state itself (Req 7.1).
 */
const EmptyStateImport = () => {
  const editor = useEditorContext()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onPickFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) {
      return
    }
    await editor.importFile(file)
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          void onPickFile(event.target.files?.[0])
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon />
        Import an endpoint.json
      </Button>
    </>
  )
}

/**
 * The canvas empty state (Req 7.1): a `role="note"` region guiding the user to
 * both add a field from the palette and import an existing definition. Rendered
 * by the Fields view only while the definition has no fields; it disappears the
 * moment a field exists. Accessible — the import affordance is a keyboard-
 * operable button with a visible focus ring.
 */
export const FieldsEmptyState = () => (
  <div
    role="note"
    aria-label="No fields yet"
    className="border-border/60 text-muted-foreground grid gap-3 rounded-md border border-dashed p-4 text-sm"
  >
    <p>
      No fields yet. Add a field by dragging a type from the palette on the
      left, or by focusing a palette item and pressing Enter. A top-level
      definition with no fields is valid.
    </p>
    <p>
      Already have an endpoint definition? Import it to pick up where you left
      off.
    </p>
    <div>
      <EmptyStateImport />
    </div>
  </div>
)

/**
 * The keyboard-discoverability hint (Req 7.2): a visible, labelled `role="note"`
 * region naming the pick-up / move / drop / cancel keys of the keyboard
 * grab-move-drop mode, so keyboard operability is discoverable beyond the
 * per-node `aria-keyshortcuts`. Gives the Req 7.2 oracle a fixed target.
 */
export const KeyboardHint = () => (
  <div
    role="note"
    aria-label="Keyboard move help"
    className="border-border/60 text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2 text-xs"
  >
    <span className="text-foreground inline-flex items-center gap-1.5 font-medium">
      <KeyboardIcon className="size-4" />
      Keyboard moves
    </span>
    <span>
      <kbd>Enter</kbd> or <kbd>Space</kbd> to pick up
    </span>
    <span>
      <kbd>↑</kbd> <kbd>↓</kbd> to move
    </span>
    <span>
      <kbd>Enter</kbd> to drop
    </span>
    <span>
      <kbd>Escape</kbd> to cancel
    </span>
  </div>
)
