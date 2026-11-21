import { useSyncExternalStore } from "react"

import { MOBILE_BREAKPOINT } from "./use-mobile"

/**
 * Subscribes to viewport changes that can cross the desktop breakpoint: the
 * media-query `change` event and plain `resize` (the latter keeps environments
 * that set `window.innerWidth` and dispatch `resize` in sync).
 */
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  window.addEventListener("resize", onChange)
  return () => {
    mql.removeEventListener("change", onChange)
    window.removeEventListener("resize", onChange)
  }
}

/** The client snapshot: whether the viewport is narrower than the breakpoint. */
function getSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT
}

/** The server snapshot: assume desktop, since there is no viewport to read. */
function getServerSnapshot(): boolean {
  return false
}

/**
 * Tracks whether the viewport is narrower than the desktop breakpoint
 * ({@link MOBILE_BREAKPOINT}).
 *
 * Unlike {@link useIsMobile}, the value is correct on the very first client
 * render (it is read synchronously through `useSyncExternalStore`), so a phone
 * never briefly renders the desktop shell before the gate takes over.
 *
 * @returns `true` while `window.innerWidth` is below the breakpoint.
 */
export function useIsBelowDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
