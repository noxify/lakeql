"use client"

import type { FitToViewMode } from "react-zoom-pan-pinch"
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch"

import { PanZoomControls } from "@/components/pan-zoom/pan-zoom-controls"

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
}: PanZoomViewportProps) => (
  <TransformWrapper
    initialScale={initialScale}
    minScale={minScale}
    maxScale={maxScale}
    centerOnInit={centerOnInit}
    fitOnInit={fitOnInit}
    wheel={{ step: wheelStep }}
    doubleClick={{ disabled: true }}
  >
    {({ zoomIn, zoomOut, resetTransform }) => (
      <>
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{ width: "100%", height: "100%" }}
        >
          {children}
        </TransformComponent>

        {showControls ? (
          <PanZoomControls
            zoomIn={zoomIn}
            zoomOut={zoomOut}
            resetTransform={resetTransform}
          />
        ) : null}
      </>
    )}
  </TransformWrapper>
)
