"use client"

import { PanZoomLightbox } from "@/components/pan-zoom/pan-zoom-lightbox"
import { PanZoomViewport } from "@/components/pan-zoom/pan-zoom-viewport"
import { cn } from "@/lib/utils"

export interface PanZoomProps {
  /**
   * Content to display. Content-agnostic: an SVG-string wrapper div, a React
   * SVG node, or an `<Image>`. The caller owns content production, so the
   * shared component never special-cases the content type.
   */
  children: React.ReactNode

  /** Lower bound for the zoom scale. Defaults to 0.25. */
  minScale?: number
  /** Upper bound for the zoom scale. Defaults to 4. */
  maxScale?: number
  /** Initial zoom scale applied on mount. Defaults to 1. */
  initialScale?: number

  /** Class name applied to the outer sized container (inline) or the preview card (lightbox). */
  className?: string
  /** Inline style for the outer sized container (inline mode only). */
  style?: React.CSSProperties
  /** Convenience aspect ratio for the inline sized box. */
  aspectRatio?: number

  /** Whether to show the zoom/reset control cluster. Defaults to true. */
  showControls?: boolean
  /** Center the content in the viewport on init. Defaults to true. */
  centerOnInit?: boolean
  /** Scale added/removed per wheel step. Defaults to 0.1. */
  wheelStep?: number

  /**
   * Render a clickable preview card that opens a {@link Dialog} with the same
   * pan/zoom viewport, instead of an inline viewport. Defaults to false.
   */
  lightbox?: boolean
  /** Accessible dialog title (lightbox only). */
  title?: string
  /** Class name applied to the preview card's content area (lightbox only). */
  previewClassName?: string
  /** How the preview card scales its content: fit inside or fill (lightbox only). */
  previewFit?: "contain" | "cover"
}

/**
 * Content-agnostic pan/zoom component backing mermaid, railroad, and image in
 * the docs.
 *
 * It takes the content as {@link PanZoomProps.children | children} and never
 * inspects the content type, so the same component handles an injected SVG
 * string, a React SVG node, or a Next `<Image>`. Sizing is caller-side: the
 * caller supplies the sized box via `className`/`style`/`aspectRatio`.
 *
 * Two modes:
 * - inline (default) — a bordered box hosting the pan/zoom viewport and the
 *   shared control cluster.
 * - `lightbox` — a clickable preview card that opens a dialog with the same
 *   viewport.
 *
 * @see PanZoomViewport for the shared interaction engine.
 * @see PanZoomLightbox for the dialog shell.
 */
export const PanZoom = ({
  children,
  minScale = 0.25,
  maxScale = 4,
  initialScale = 1,
  className,
  style,
  aspectRatio,
  showControls = true,
  centerOnInit = true,
  wheelStep = 0.1,
  lightbox = false,
  title,
  previewClassName,
  previewFit,
}: PanZoomProps) => {
  if (lightbox) {
    return (
      <PanZoomLightbox
        className={className}
        previewClassName={previewClassName}
        previewFit={previewFit}
        title={title}
        minScale={minScale}
        maxScale={maxScale}
        initialScale={initialScale}
        wheelStep={wheelStep}
      >
        {children}
      </PanZoomLightbox>
    )
  }

  return (
    <div
      className={cn("relative overflow-hidden rounded-lg border", className)}
      style={{ aspectRatio, ...style }}
    >
      <PanZoomViewport
        minScale={minScale}
        maxScale={maxScale}
        initialScale={initialScale}
        showControls={showControls}
        centerOnInit={centerOnInit}
        wheelStep={wheelStep}
      >
        {children}
      </PanZoomViewport>
    </div>
  )
}
