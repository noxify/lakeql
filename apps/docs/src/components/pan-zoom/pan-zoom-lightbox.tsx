"use client"

import { Expand } from "lucide-react"
import * as React from "react"

import { PanZoomViewport } from "@/components/pan-zoom/pan-zoom-viewport"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export interface PanZoomLightboxProps {
  /** Content to display in both the preview card and the dialog viewport. */
  children: React.ReactNode
  /** Class name applied to the preview card button. */
  className?: string
  /** Class name applied to the preview card's content area (sets its height). */
  previewClassName?: string
  /** How the preview card scales its content: fit inside or fill the card. */
  previewFit?: "contain" | "cover"
  /** Class name applied to the dialog content. */
  dialogClassName?: string
  /** Accessible dialog title. */
  title?: string
  /** Lower bound for the zoom scale. */
  minScale?: number
  /** Upper bound for the zoom scale. */
  maxScale?: number
  /** Initial zoom scale applied inside the dialog. */
  initialScale?: number
  /** Scale added/removed per wheel step. */
  wheelStep?: number
}

/**
 * Lightbox pan/zoom: a scaled-down preview card that opens a {@link Dialog}
 * hosting the shared {@link PanZoomViewport}.
 *
 * The preview card measures its content and container with a `ResizeObserver`
 * and scales the content to fit (`contain`) or fill (`cover`) the card, matching
 * the look of the previous hand-built dialog. Inside the dialog the library's
 * `fitOnInit` frames the content, so the viewport opens at a sensible scale.
 */
export const PanZoomLightbox = ({
  children,
  className,
  previewClassName,
  previewFit = "contain",
  dialogClassName,
  title = "Diagram",
  minScale = 0.25,
  maxScale = 4,
  initialScale = 1,
  wheelStep = 0.1,
}: PanZoomLightboxProps) => {
  const [open, setOpen] = React.useState(false)
  const previewContainerRef = React.useRef<HTMLDivElement>(null)
  const previewContentRef = React.useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = React.useState(0.45)

  const updatePreviewScale = React.useCallback(() => {
    const container = previewContainerRef.current
    const content = previewContentRef.current

    if (!container || !content) {
      return
    }

    const containerW = container.clientWidth
    const containerH = container.clientHeight
    const contentW = content.scrollWidth
    const contentH = content.scrollHeight

    if (containerW <= 0 || containerH <= 0 || contentW <= 0 || contentH <= 0) {
      return
    }

    const padding = 24
    const scaleX = (containerW - padding) / contentW
    const scaleY = (containerH - padding) / contentH
    const fittedScale =
      previewFit === "cover"
        ? Math.max(scaleX, scaleY)
        : Math.min(scaleX, scaleY, 1)
    // Allow `contain` previews to scale slightly above 1 so a small or sparse
    // diagram fills the preview card instead of sitting tiny and centered with
    // large empty margins.
    const upperBound = previewFit === "cover" ? 6 : 1.5
    const clampedScale = Math.min(upperBound, Math.max(0.08, fittedScale))

    setPreviewScale(clampedScale)
  }, [previewFit])

  React.useLayoutEffect(() => {
    updatePreviewScale()

    const container = previewContainerRef.current
    const content = previewContentRef.current

    if (!container || !content) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      updatePreviewScale()
    })

    resizeObserver.observe(container)
    resizeObserver.observe(content)

    return () => {
      resizeObserver.disconnect()
    }
    // `children` is a trigger: the effect re-measures the preview scale when
    // the rendered content changes but does not read children in its body.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [children, updatePreviewScale])

  return (
    <>
      {/* Preview Card */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative w-full overflow-hidden rounded-lg border text-left transition-all hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className
        )}
      >
        {/* Preview Content - scaled down and centered */}
        <div
          ref={previewContainerRef}
          className={cn(
            "pointer-events-none relative overflow-hidden",
            previewClassName
          )}
        >
          <div
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <div
              ref={previewContentRef}
              style={{
                transform: `scale(${previewScale})`,
                transformOrigin: "center center",
              }}
            >
              {children}
            </div>
          </div>
        </div>

        {/* Hover Overlay */}
        <div className="bg-background/60 absolute inset-0 flex items-center justify-center opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
          <div className="bg-foreground text-background flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-lg">
            <Expand className="size-4" />
            <span>Click to expand</span>
          </div>
        </div>
      </button>

      {/* Fullscreen Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            // bg-background (not the dialog's default bg-popover) so the
            // diagram sits on the same surface as the inline view; the
            // transparent diagram background then matches in both places.
            "bg-background h-[88vh] max-h-[92vh] w-[98vw] max-w-7xl! overflow-hidden p-0",
            dialogClassName
          )}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>

          <div className="relative h-full w-full overflow-hidden">
            {open ? (
              <PanZoomViewport
                minScale={minScale}
                maxScale={maxScale}
                initialScale={initialScale}
                wheelStep={wheelStep}
                centerOnInit={true}
                fitOnInit={previewFit === "cover" ? "cover" : "contain"}
              >
                <div className="flex h-full w-full items-center justify-center p-8">
                  {children}
                </div>
              </PanZoomViewport>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
