"use client"

import React from "react"

import { computeMermaidBox } from "@/components/mdx/mermaid-sizing"
import { PanZoom } from "@/components/pan-zoom/pan-zoom"

/**
 * The diagram content: the pre-rendered SVG injected into a centered flex box.
 *
 * Shared by the inline and lightbox render paths so both display the diagram
 * identically.
 *
 * @param props.svg - The pre-rendered SVG markup.
 */
const MermaidContent = ({ svg }: { svg: string }) => (
  <div
    className="flex h-full w-full items-center justify-center [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full"
    // oxlint-disable-next-line react/no-danger
    dangerouslySetInnerHTML={{ __html: svg }}
  />
)

/**
 * Client-side display shell for a pre-rendered mermaid SVG.
 *
 * The SVG is rendered to a string at build time by `renderDiagram` on the
 * server; this component only lays it out and provides pan/zoom interaction via
 * the shared `<PanZoom>`. It contains no mermaid renderer code, so the renderer
 * never enters the browser bundle.
 *
 * @param props.svg - The pre-rendered SVG markup to display.
 * @param props.preview - When true, render a clickable preview card that opens
 *   the diagram in a pan/zoom dialog; otherwise render the pan/zoom viewport
 *   inline.
 */
export const MermaidPanZoom = ({
  svg,
  preview = false,
}: {
  svg: string
  preview?: boolean
}) => {
  const { style, initialScale, previewClassName, previewFit } = React.useMemo(
    () => computeMermaidBox(svg),
    [svg]
  )

  if (preview) {
    return (
      <PanZoom
        lightbox={true}
        title="Diagram"
        className="my-6"
        previewClassName={previewClassName}
        initialScale={initialScale}
        previewFit={previewFit}
      >
        <MermaidContent svg={svg} />
      </PanZoom>
    )
  }

  return (
    <PanZoom className="my-6 w-full" style={style} initialScale={initialScale}>
      <MermaidContent svg={svg} />
    </PanZoom>
  )
}
