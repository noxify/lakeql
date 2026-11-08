"use client"

import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"
import React from "react"
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch"

import { Button } from "@/components/ui/button"

const DEFAULT_ASPECT_RATIO = 16 / 9

function parseMermaidDimensions(
  svg: string
): { width: number; height: number } | null {
  const viewBoxMatch = svg.match(/viewBox=["'](?<value>[^"']+)["']/iu)

  if (viewBoxMatch?.groups?.value) {
    const parts = viewBoxMatch.groups.value
      .split(/[\s,]+/u)
      .map(Number)
      .filter((part) => Number.isFinite(part))

    if (parts.length === 4) {
      const width = parts.at(2)
      const height = parts.at(3)

      if (width && height && width > 0 && height > 0) {
        return { width, height }
      }
    }
  }

  const widthMatch = svg.match(
    /\bwidth=["'](?<value>[0-9]*\.?[0-9]+)(?:px)?["']/iu
  )
  const heightMatch = svg.match(
    /\bheight=["'](?<value>[0-9]*\.?[0-9]+)(?:px)?["']/iu
  )

  if (widthMatch && heightMatch) {
    const width = Number(widthMatch.groups?.value)
    const height = Number(heightMatch.groups?.value)

    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      return { width, height }
    }
  }

  return null
}

function parseMermaidAspectRatio(svg: string): number {
  const dimensions = parseMermaidDimensions(svg)

  if (dimensions) {
    return dimensions.width / dimensions.height
  }

  return DEFAULT_ASPECT_RATIO
}

/**
 * Zoom/reset control cluster rendered inside `TransformWrapper`.
 *
 * Reads the library's programmatic controls from the render prop and exposes
 * zoom-in, zoom-out, and reset-to-fit buttons.
 *
 * @param props.zoomIn - Library handler that steps the zoom level up.
 * @param props.zoomOut - Library handler that steps the zoom level down.
 * @param props.resetTransform - Library handler that resets pan and zoom.
 */
const PanZoomControls = ({
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

/**
 * Client-side display shell for a pre-rendered mermaid SVG.
 *
 * The SVG is rendered to a string at build time by `renderDiagram` on the
 * server; this component only lays it out and provides pan/zoom interaction via
 * `react-zoom-pan-pinch`. It contains no mermaid renderer code, so the renderer
 * never enters the browser bundle.
 *
 * The `preview` prop is accepted for interface compatibility with the server
 * component but no longer selects a separate lightbox: the library viewport
 * provides pan/zoom inline in every case.
 *
 * @param props.svg - The pre-rendered SVG markup to display.
 * @param props.preview - Accepted for interface compatibility; no longer
 *   changes the rendering.
 */
export const MermaidPanZoom = ({ svg }: { svg: string; preview?: boolean }) => {
  const inlineAspectRatio = React.useMemo(() => {
    const rawRatio = parseMermaidAspectRatio(svg)

    // Prevent extreme SVG ratios from creating unusable viewport heights.
    return Math.min(4, Math.max(0.85, rawRatio))
  }, [svg])

  const inlineDimensions = React.useMemo(
    () => parseMermaidDimensions(svg),
    [svg]
  )

  const isVeryWideDiagram =
    inlineAspectRatio > 2.2 ||
    (inlineDimensions ? inlineDimensions.width >= 1600 : false)
  const initialScale = isVeryWideDiagram ? 0.9 : 1

  const inlineMinHeight = inlineAspectRatio < 1 ? "18rem" : "20rem"
  const inlineMaxHeight =
    inlineAspectRatio < 1 ? "48vh" : inlineAspectRatio < 1.4 ? "54vh" : "60vh"
  const inlineHeight = inlineDimensions
    ? `min(calc(${Math.round(inlineDimensions.height)}px + 4rem), ${inlineMaxHeight})`
    : undefined

  return (
    <div
      className="my-6 w-full"
      style={{
        aspectRatio: inlineHeight ? undefined : inlineAspectRatio,
        height: inlineHeight,
        minHeight: inlineMinHeight,
        maxHeight: inlineMaxHeight,
      }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-lg border">
        <TransformWrapper
          initialScale={initialScale}
          minScale={0.25}
          maxScale={4}
          centerOnInit={true}
          wheel={{ step: 0.15 }}
          doubleClick={{ disabled: true }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%" }}
              >
                <div
                  className="flex h-full w-full items-center justify-center [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full"
                  // oxlint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </TransformComponent>

              <PanZoomControls
                zoomIn={zoomIn}
                zoomOut={zoomOut}
                resetTransform={resetTransform}
              />
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  )
}
