import * as React from "react"

/**
 * The phone-width breakpoint, in pixels. At or below this viewport width the
 * contextual secondary navigation must not occupy a fixed side column (it would
 * clip the main content's field rows and right-hand controls); instead it
 * collapses into a header-triggered sheet so the main content gets full width.
 *
 * This is deliberately narrower than {@link useIsMobile}'s `768px` breakpoint,
 * which governs the off-canvas primary rail: the primary rail goes off-canvas
 * earlier (≤767px) than the secondary nav collapses (≤560px), so between 561px
 * and 767px the primary nav is a sheet while the secondary nav still renders as
 * an inline column.
 */
const NARROW_BREAKPOINT = 560

/**
 * Tracks whether the viewport is at or below the phone-width
 * {@link NARROW_BREAKPOINT}, where the contextual secondary navigation collapses
 * out of the layout into an on-demand sheet.
 *
 * @returns `true` when the viewport width is `≤ 560px`, `false` otherwise
 * (including during the first render before the media query resolves).
 */
export function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`)
    const onChange = () => {
      setIsNarrow(window.innerWidth <= NARROW_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsNarrow(window.innerWidth <= NARROW_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isNarrow
}
