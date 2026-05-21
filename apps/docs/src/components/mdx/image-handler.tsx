"use client"

import Image from "next/image"

import { PanZoomDialog } from "@/components/pan-zoom/pan-zoom-dialog"

interface ImageHandlerProps {
  src: string
  alt?: string
  width?: number
  height?: number
  previewFit?: "cover" | "contain"
  mode?: "default" | "zoom"
}

export function ImageHandler({
  src,
  alt = "",
  width = 0,
  height = 0,
  previewFit = "contain",
  mode = "default",
}: ImageHandlerProps) {
  const hasExplicitSize = width > 0 && height > 0
  const fallbackContainerClass =
    mode === "default"
      ? "relative h-80 w-full max-w-350 md:h-96"
      : "relative h-[70vh] w-350 max-w-full"

  const imageNode = hasExplicitSize ? (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className="not-prose h-auto w-auto max-w-full object-contain"
      priority
    />
  ) : (
    // Fallback for markdown images without known dimensions.
    <div className={fallbackContainerClass}>
      <Image
        src={src}
        alt={alt}
        fill
        className="not-prose object-contain"
        sizes="80vw"
        priority
      />
    </div>
  )

  if (mode === "default") {
    return (
      <section className="my-8">
        <div className="flex items-center justify-center">
          <div className="w-full max-w-full [&_img]:h-auto [&_img]:max-w-full">
            {imageNode}
          </div>
        </div>
      </section>
    )
  }

  if (mode === "zoom") {
    return (
      <PanZoomDialog
        title={alt || "Image"}
        className="my-8"
        previewClassName="h-72"
        previewFit={previewFit}
        fitOnMount={true}
        initialZoom={1}
      >
        <div
          className={
            previewFit === "cover"
              ? "inline-block [&_img]:object-cover"
              : "inline-block [&_img]:object-contain"
          }
        >
          {imageNode}
        </div>
      </PanZoomDialog>
    )
  }

  return null
}
