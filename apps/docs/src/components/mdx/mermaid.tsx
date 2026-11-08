import { MermaidPanZoom } from "./mermaid-pan-zoom"
import { renderDiagram } from "./render-diagram"

/**
 * Server component that renders a mermaid fence to a static SVG at build/SSG
 * time and hands the markup to a thin client shell for display and pan/zoom.
 *
 * The renderer runs only on the server, so no mermaid renderer code ships to
 * the browser. Light/dark theming is driven by the pre-rendered SVG's CSS
 * custom properties (see `render-diagram.ts` and the `--diagram-*` variables in
 * `globals.css`), not by re-rendering on theme change.
 *
 * @param props.code - The mermaid diagram source from the MDX fence.
 * @param props.preview - When true, display the diagram in an expandable
 *   lightbox instead of an inline viewport.
 */
export const MermaidDiagram = ({
  code,
  preview,
}: {
  code: string
  preview?: boolean
}) => {
  let svg: string

  try {
    svg = renderDiagram(code)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return <pre>{message}</pre>
  }

  return <MermaidPanZoom svg={svg} preview={preview} />
}
