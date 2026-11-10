import { useEffect, useRef, useState } from "react"

import { announcementFor } from "./announcement"
import { summarizeDiagnostics } from "./diagnostics"
import { useEditorContext } from "./use-editor"

/**
 * A visually hidden `aria-live` region that announces validation changes to
 * assistive technology (Req 12.5), complementing the inline, control-associated
 * errors. When a validation error appears, changes, or clears, the live region
 * text updates and the screen reader reads it without the user having to poll
 * the UI visually.
 *
 * The region is `polite` so announcements do not interrupt the user mid-action,
 * and `atomic` so the whole status is re-read on each change. Announcing only
 * on an actual change avoids repeating the same status on unrelated re-renders.
 */
export const ValidationAnnouncer = () => {
  const editor = useEditorContext()
  const valid = editor.validation.validForExport
  const issueCount = summarizeDiagnostics(editor.validation).length

  const [message, setMessage] = useState("")
  const lastRef = useRef<string | null>(null)

  useEffect(() => {
    const next = announcementFor(valid, issueCount)
    if (next !== lastRef.current) {
      lastRef.current = next
      setMessage(next)
    }
  }, [valid, issueCount])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  )
}
