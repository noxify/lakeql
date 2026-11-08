"use client"

import * as React from "react"
import type { FitToViewMode } from "react-zoom-pan-pinch"
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch"

import { PanZoomControls } from "@/components/pan-zoom/pan-zoom-controls"
import { PanZoomKeyHint } from "@/components/pan-zoom/pan-zoom-key-hint"

/**
 * Accessible description of the keyboard controls, exposed to assistive tech on
 * the focusable viewport wrapper. Mirrors the shortcuts shown by
 * {@link PanZoomKeyHint}.
 */
const KEYBOARD_ARIA_LABEL =
  "Diagram viewer. Use arrow keys to pan, plus and minus to zoom, zero to reset."

export interface PanZoomViewportProps {
  /**
   * Content to display. Content-agnostic: an SVG-string wrapper div, a React
   * SVG node, or an `<Image>`. The caller owns content production.
   */
  children: React.ReactNode
  /** Lower bound for the zoom scale. */
  minScale?: number
  /** Upper bound for the zoom scale. */
  maxScale?: number
  /** Initial zoom scale applied on mount. */
  initialScale?: number
  /** Whether to show the zoom/reset control cluster. */
  showControls?: boolean
  /** Center the content in the viewport on init. */
  centerOnInit?: boolean
  /**
   * Fit the content to the viewport on init (and again when the content gets
   * its size). Overrides `centerOnInit` behaviour when set.
   */
  fitOnInit?: boolean | FitToViewMode
  /** Scale added/removed per wheel step. */
  wheelStep?: number
}

/**
 * Shared pan/zoom viewport built on `react-zoom-pan-pinch`.
 *
 * Provides the single interaction engine (drag-to-pan, wheel-zoom, bounded
 * scale) and the shared control cluster for every consumer. Both the inline
 * `<PanZoom>` and the lightbox dialog render this viewport so they share one
 * behaviour. Fills its parent box; the caller supplies the sized container.
 *
 * Keyboard navigation is on (arrows pan, `+`/`-` zoom, `0` resets). The library
 * only ships the behaviour, so this viewport adds the visible affordance: an
 * `aria-label` and a focus ring on the focusable wrapper, plus a
 * {@link PanZoomKeyHint} overlay listing the shortcuts.
 */
export const PanZoomViewport = ({
  children,
  minScale = 0.25,
  maxScale = 4,
  initialScale = 1,
  showControls = true,
  centerOnInit = true,
  fitOnInit,
  wheelStep = 0.1,
}: PanZoomViewportProps) => {
  const [focused, setFocused] = React.useState(false)

  return (
    <TransformWrapper
      initialScale={initialScale}
      minScale={minScale}
      maxScale={maxScale}
      centerOnInit={centerOnInit}
      fitOnInit={fitOnInit}
      wheel={{ step: wheelStep }}
      doubleClick={{ disabled: true }}
      // Keyboard navigation: arrow keys pan, +/- zoom, 0 resets. The library sets
      // tabIndex=0 on the wrapper when enabled, so the viewport is focusable and
      // the handlers fire only while focus is inside it (click or tab in) — the
      // keys never hijack page scroll when the diagram is not focused.
      keyboard={{ disabled: false, panStep: 20, zoomStep: 0.1 }}
    >
      {({ zoomIn, zoomOut, resetTransform }) => (
        <div className="group relative size-full">
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "100%" }}
            contentStyle={{ width: "100%", height: "100%" }}
            // The library sets tabIndex=0 here, making this div the keyboard
            // focus target. Describe the controls for screen readers and track
            // focus (onFocus/onBlur bubble from the wrapper) to drive the
            // visible focus ring and the KeyHint's "active" state.
            wrapperProps={{
              "aria-label": KEYBOARD_ARIA_LABEL,
              role: "application",
              onFocus: () => setFocused(true),
              onBlur: () => setFocused(false),
            }}
            // A focus ring that only shows while focus is inside the viewport,
            // using the repo's shared ring token (not a hardcoded colour).
            wrapperClass={
              focused
                ? "outline-none ring-2 ring-ring ring-inset"
                : "outline-none"
            }
          >
            {children}
          </TransformComponent>

          <PanZoomKeyHint focused={focused} />

          {showControls ? (
            <PanZoomControls
              zoomIn={zoomIn}
              zoomOut={zoomOut}
              resetTransform={resetTransform}
            />
          ) : null}
        </div>
      )}
    </TransformWrapper>
  )
}
