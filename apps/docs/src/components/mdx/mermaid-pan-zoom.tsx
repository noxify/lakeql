"use client"

import React from "react"

import { computeMermaidBox } from "@/components/mdx/mermaid-sizing"
import { PanZoom } from "@/components/pan-zoom/pan-zoom"

/**
 * Client-side display shell for a pre-rendered mermaid SVG.
 *
 * The SVG is rendered to a string at build time by `renderDiagram` on the
 * server; this component only lays it out and provides pan/zoom interaction via
 * the shared `<PanZoom>`. It contains no mermaid renderer code, so the renderer
 * never enters the browser bundle.
 *
 * The `preview` prop is accepted for interface compatibility with the server
 * component but no longer selects a separate lightbox: the viewport provides
 * pan/zoom inline in every case.
 *
 * @param props.svg - The pre-rendered SVG markup to display.
 * @param props.preview - Accepted for interface compatibility; no longer
 *   changes the rendering.
 */
export const MermaidPanZoom = ({ svg }: { svg: string; preview?: boolean }) => {
  const { style, initialScale } = React.useMemo(
    () => computeMermaidBox(svg),
    [svg]
  )

  return (
    <PanZoom className="my-6 w-full" style={style} initialScale={initialScale}>
      <div
        className="flex h-full w-full items-center justify-center [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full"
        // oxlint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </PanZoom>
  )
}
