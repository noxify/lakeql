import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react"

import { toDefinition } from "@/core"

import { useEditorContext } from "./use-editor"

/**
 * The live, read-oriented JSON view (task 15).
 *
 * It reflects `toDefinition(state)` over the exact same live state the tree
 * edits — there is no separate model (Req 7.2) — and re-renders on every change
 * so the JSON tracks the tree live (Req 7.1). It renders even when the state is
 * invalid, with a validity badge so the discrepancy is visible (Req 7.3); it is
 * read-only, so an invalid state is shown, not blocked.
 */
export const JsonView = () => {
  const editor = useEditorContext()
  const valid = editor.validation.validForExport

  // The candidate definition the exporter would produce. Serialized even when
  // invalid so the user can see exactly what the tree maps to.
  const json = JSON.stringify(toDefinition(editor.state), null, 2)

  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-2">
      <div className="flex items-center gap-1.5 text-sm">
        {valid ? (
          <>
            <CheckCircle2Icon className="text-primary size-4" />
            <span className="text-muted-foreground">Valid for export</span>
          </>
        ) : (
          <>
            <AlertTriangleIcon className="text-destructive size-4" />
            <span className="text-destructive">
              Invalid — shown for reference, export is blocked
            </span>
          </>
        )}
      </div>

      <pre className="bg-muted/40 overflow-auto rounded-md p-3 text-xs">
        <code>{json}</code>
      </pre>
    </div>
  )
}
