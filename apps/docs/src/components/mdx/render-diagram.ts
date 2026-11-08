import "server-only"
import { renderMermaidSVG } from "agentic-mermaid"
import type { RenderOptions } from "agentic-mermaid"

/**
 * Fixed render options for every docs mermaid diagram.
 *
 * Colors are emitted as CSS custom properties on the SVG root (`--bg`, `--fg`,
 * …) that point at the `--diagram-*` variables defined in `globals.css`. The
 * diagram is therefore rendered once at build time and recolored for light/dark
 * purely by the `.dark` class flipping those variables — no re-render on theme
 * change.
 *
 * `security: 'strict'` guarantees the SVG contains no external-fetch references
 * (it also forces `embedFontImport` off); `--font` still declares the family.
 */
const webDiagramOptions = {
  bg: "var(--diagram-bg)",
  fg: "var(--diagram-fg)",
  line: "var(--diagram-line)",
  accent: "var(--diagram-accent)",
  muted: "var(--diagram-muted)",
  surface: "var(--diagram-surface)",
  border: "var(--diagram-border)",
  font: "Inter, system-ui, sans-serif",
  embedFontImport: false,
  security: "strict",
} satisfies RenderOptions

/**
 * Render a mermaid source string to a static SVG string at build/SSG time.
 *
 * This runs on the server only; no renderer code reaches the browser bundle.
 *
 * @param source - The mermaid diagram source.
 * @returns The rendered SVG markup as a string.
 * @throws {Error} If the mermaid source fails to parse or render.
 */
export function renderDiagram(source: string): string {
  return renderMermaidSVG(source, webDiagramOptions)
}
