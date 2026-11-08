"use client"

import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Zoom/reset control cluster rendered inside a `TransformWrapper`.
 *
 * Reads the library's programmatic controls from the render prop and exposes
 * zoom-in, zoom-out, and reset-to-fit buttons. This is the single control UI
 * shared by every pan/zoom consumer (mermaid, railroad, image) — a bottom-right
 * overlay with no percentage readout and no "drag to pan" hint.
 *
 * @param props.zoomIn - Library handler that steps the zoom level up.
 * @param props.zoomOut - Library handler that steps the zoom level down.
 * @param props.resetTransform - Library handler that resets pan and zoom.
 */
export const PanZoomControls = ({
  zoomIn,
  zoomOut,
  resetTransform,
}: {
  zoomIn: () => void
  zoomOut: () => void
  resetTransform: () => void
}) => (
  <div className="bg-background/95 absolute right-3 bottom-3 z-10 flex items-center gap-1 rounded-md border p-1 shadow-sm backdrop-blur-sm">
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => zoomOut()}
      title="Zoom out"
    >
      <ZoomOut className="size-4" />
      <span className="sr-only">Zoom out</span>
    </Button>

    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => zoomIn()}
      title="Zoom in"
    >
      <ZoomIn className="size-4" />
      <span className="sr-only">Zoom in</span>
    </Button>

    <div className="bg-border mx-1 h-4 w-px" />

    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => resetTransform()}
      title="Reset view"
    >
      <Maximize2 className="size-4" />
      <span className="sr-only">Reset view</span>
    </Button>
  </div>
)
