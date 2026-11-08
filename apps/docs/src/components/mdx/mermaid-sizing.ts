const DEFAULT_ASPECT_RATIO = 16 / 9

/**
 * Parses a mermaid SVG's intrinsic pixel dimensions.
 *
 * Prefers the `viewBox` width/height, then falls back to the `width`/`height`
 * attributes.
 *
 * @param svg - The pre-rendered SVG markup.
 * @returns The width and height in pixels, or `null` when neither source yields
 *   valid positive dimensions.
 */
export function parseMermaidDimensions(
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

/**
 * Derives a mermaid SVG's width-to-height aspect ratio.
 *
 * @param svg - The pre-rendered SVG markup.
 * @returns The aspect ratio, or {@link DEFAULT_ASPECT_RATIO} (16/9) when
 *   dimensions cannot be parsed.
 */
export function parseMermaidAspectRatio(svg: string): number {
  const dimensions = parseMermaidDimensions(svg)

  if (dimensions) {
    return dimensions.width / dimensions.height
  }

  return DEFAULT_ASPECT_RATIO
}

/**
 * Computes the caller-side sizing for a mermaid diagram's inline pan/zoom box.
 *
 * Clamps the aspect ratio to a usable range, flags very wide diagrams so they
 * open slightly zoomed out, and derives the container's height bands from the
 * diagram's shape. The returned values feed the `<PanZoom>` container's style
 * and `initialScale`.
 *
 * @param svg - The pre-rendered SVG markup.
 * @returns Container `style`, the `initialScale` to pass to `<PanZoom>`.
 */
export function computeMermaidBox(svg: string): {
  style: React.CSSProperties
  initialScale: number
} {
  const rawRatio = parseMermaidAspectRatio(svg)

  // Prevent extreme SVG ratios from creating unusable viewport heights.
  const aspectRatio = Math.min(4, Math.max(0.85, rawRatio))
  const dimensions = parseMermaidDimensions(svg)

  const isVeryWideDiagram =
    aspectRatio > 2.2 || (dimensions ? dimensions.width >= 1600 : false)
  const initialScale = isVeryWideDiagram ? 0.9 : 1

  const minHeight = aspectRatio < 1 ? "18rem" : "20rem"
  const maxHeight =
    aspectRatio < 1 ? "48vh" : aspectRatio < 1.4 ? "54vh" : "60vh"
  const height = dimensions
    ? `min(calc(${Math.round(dimensions.height)}px + 4rem), ${maxHeight})`
    : undefined

  return {
    style: {
      aspectRatio: height ? undefined : aspectRatio,
      height,
      minHeight,
      maxHeight,
    },
    initialScale,
  }
}
