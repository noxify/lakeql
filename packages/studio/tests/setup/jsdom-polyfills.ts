// Polyfills the handful of browser APIs jsdom does not implement but the
// shadcn/Base UI + react-resizable-panels components reach for on mount. Guarded
// on `window` so this setup is a no-op in the Node-environment core tests (it is
// appended to every project's setupFiles by the shared config merge).

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
}
