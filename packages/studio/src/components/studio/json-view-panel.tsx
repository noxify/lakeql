import { CheckIcon, CopyIcon } from "lucide-react"
import { useCallback, useState } from "react"

import { Button } from "@/components/ui/button"
import { toDefinition } from "@/core"

import { JsonView } from "./json-view"
import { useEditorContext } from "./use-editor"

/**
 * A copy-to-clipboard action for the live JSON (Req 6.2). Serializes the same
 * candidate definition {@link JsonView} shows (`toDefinition(state)`) and writes
 * it to the clipboard, briefly reflecting a "Copied" state. Keyboard-operable
 * with a visible focus ring via the shared `Button`.
 */
const CopyJsonButton = () => {
  const editor = useEditorContext()
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (): Promise<void> => {
    const json = JSON.stringify(toDefinition(editor.state), null, 2)
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be denied; leave the button in its idle state
      // rather than surfacing a hard error for a convenience action.
      setCopied(false)
    }
  }, [editor.state])

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label="Copy JSON"
      onClick={() => {
        void copy()
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}

/**
 * The JSON rail section's main content (Req 6.1, 6.2): the live, read-oriented
 * {@link JsonView} plus a copy-to-clipboard action. The view and the copy
 * action read the same live state, so the copied text matches what is shown.
 */
export const JsonViewPanel = () => (
  <div className="grid h-full grid-rows-[auto_1fr] gap-2">
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-medium">JSON</h2>
      <CopyJsonButton />
    </div>
    <div className="min-h-0">
      <JsonView />
    </div>
  </div>
)
