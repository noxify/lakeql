// Polyfills the handful of browser APIs jsdom does not implement but the
// shadcn/Base UI + react-resizable-panels components reach for on mount. Guarded
// on `window` so this setup is a no-op in the Node-environment core tests (it is
// appended to every project's setupFiles by the shared config merge).
import { afterEach } from "vitest"

/** A no-op used by the observer/media stubs below (jsdom has no layout). */
const noop = (): void => {
  /* intentionally empty */
}

if (typeof window !== "undefined") {
  if (!("ResizeObserver" in window)) {
    class ResizeObserverStub {
      observe = noop
      unobserve = noop
      disconnect = noop
    }
    // @ts-expect-error assigning the stub onto the jsdom window.
    window.ResizeObserver = ResizeObserverStub
    globalThis.ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver
  }

  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: noop,
        removeListener: noop,
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => false,
      }) as MediaQueryList
  }

  if (typeof Element.prototype.scrollIntoView !== "function") {
    Element.prototype.scrollIntoView = noop
  }

  // The shell now syncs its active view into `window.location.hash`, which —
  // unlike React state — is not torn down by `cleanup()` and so leaks across
  // tests in a file (a prior test that navigated to `#json` would make the next
  // mount start on JSON instead of the default Settings view). Reset the hash
  // between tests so each case starts from a clean URL.
  afterEach(() => {
    window.history.replaceState(null, "", window.location.pathname)
  })
}
