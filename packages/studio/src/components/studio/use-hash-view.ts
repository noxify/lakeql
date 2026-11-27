import { useCallback, useEffect, useState } from "react"

import type { ShellView } from "./shell-view"
import { isShellView } from "./shell-view"

/** The view shown when the URL hash is empty or not a valid view id. */
const FALLBACK_VIEW: ShellView = "settings"

/**
 * Reads the active {@link ShellView} from `window.location.hash`, falling back
 * to {@link FALLBACK_VIEW} for an empty or unrecognized hash (for example
 * `#foo`). The leading `#` is stripped before validation.
 *
 * @returns The view encoded in the current hash, or `"settings"` when the hash
 * is empty or invalid.
 */
function readHashView(): ShellView {
  // Guard against a missing `window` (SSR / non-DOM test environments). The
  // library is client-only, but the guard is cheap and keeps the hook safe to
  // import anywhere.
  if (typeof window === "undefined") {
    return FALLBACK_VIEW
  }
  const raw = window.location.hash.replace(/^#/u, "")
  return isShellView(raw) ? raw : FALLBACK_VIEW
}

/**
 * Syncs the active {@link ShellView} with the URL hash so a page reload (or a
 * shared deep link) restores the current view.
 *
 * On mount the view is initialized from `window.location.hash`. Switching the
 * view writes the new hash with `history.replaceState` rather than assigning
 * `location.hash`: each view switch should not push a new browser-history
 * entry, so the back button returns to the previous page instead of walking
 * backwards through every view the user visited. An empty or unrecognized hash
 * resolves to `"settings"`; an unrecognized hash is left untouched in the URL
 * (the view simply falls back), so a user's manually-typed garbage hash is not
 * rewritten unless they actually switch views.
 *
 * A `hashchange` listener keeps the view in step with browser back/forward
 * navigation and manual edits to the address bar; it is removed on unmount.
 *
 * @returns A `[view, setView]` tuple matching the shape the shell feeds to
 * `ShellViewProvider`.
 */
export function useHashView(): [ShellView, (view: ShellView) => void] {
  const [view, setView] = useState<ShellView>(readHashView)

  useEffect(() => {
    const onHashChange = () => {
      setView(readHashView())
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  const selectView = useCallback(
    (next: ShellView) => {
      setView(next)
      if (typeof window !== "undefined") {
        // `replaceState` updates the URL without adding a history entry and
        // without emitting a `hashchange` event, so state and URL stay in sync
        // without the listener double-handling this programmatic switch.
        window.history.replaceState(null, "", `#${next}`)
      }
    },
    [setView]
  )

  return [view, selectView]
}
