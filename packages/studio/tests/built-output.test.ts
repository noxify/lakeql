import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * These assertions run against the **built** artifacts, not the TypeScript
 * source, exactly as the design's testing strategy requires (Req 1.1, 1.3,
 * 1.5, 11.4): the package CSS is validated as a shipped `dist/` asset, and the
 * `apps/editor` output is validated to be purely static. They therefore depend
 * on `pnpm build:pkg` and the `apps/editor` build having run first — the
 * worktree build prerequisite the validation sequence already follows.
 */

const packageRoot = fileURLToPath(new URL("..", import.meta.url))
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))

const studioCssPath = `${packageRoot}/dist/studio.css`
const editorDistDir = `${repoRoot}/apps/editor/dist`

/**
 * Recursively lists every file path (relative to `dir`) under a directory.
 */
function listFiles(dir: string, prefix = ""): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      out.push(...listFiles(`${dir}/${entry.name}`, rel))
    } else {
      out.push(rel)
    }
  }
  return out
}

describe("packaged CSS (Req 1.1, 11.4)", () => {
  it("ships a single precompiled studio.css in dist", () => {
    expect(
      existsSync(studioCssPath),
      "dist/studio.css is missing — run `pnpm build:pkg` first"
    ).toBeTruthy()
    // A real compiled stylesheet, not an empty placeholder.
    expect(statSync(studioCssPath).size).toBeGreaterThan(1000)
  })

  it("carries the shadcn theme tokens and base utilities a consumer needs with no Tailwind config of its own", () => {
    const css = readFileSync(studioCssPath, "utf-8")
    // Theme variables (light + dark) are baked in, so a bare consumer renders
    // the themed component correctly.
    expect(css).toContain("--background")
    expect(css).toContain("--primary")
    expect(css).toContain(".dark")
    // The accessibility-critical utilities this feature relies on are emitted:
    // the screen-reader-only live region and the visible focus ring.
    expect(css).toContain("sr-only")
    expect(css).toContain("ring")
  })
})

describe("apps/editor is a static, server-free build (Req 1.3, 1.5)", () => {
  it("emits only static assets under dist and no serverless/SSR artifacts", () => {
    expect(
      existsSync(editorDistDir),
      "apps/editor/dist is missing — run `pnpm --filter editor build` first"
    ).toBeTruthy()

    const files = listFiles(editorDistDir)

    // The static entry exists.
    expect(files).toContain("index.html")

    // Only static web asset extensions are present — no function manifests,
    // Node servers, or SSR bundles.
    const staticExtensions = new Set([
      "html",
      "js",
      "mjs",
      "css",
      "map",
      "json",
      "svg",
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "ico",
      "woff",
      "woff2",
      "ttf",
      "txt",
    ])
    for (const file of files) {
      const ext = file.split(".").pop() ?? ""
      expect(
        staticExtensions.has(ext),
        `unexpected non-static artifact in dist: ${file}`
      ).toBeTruthy()
    }

    // No Vercel/serverless function directories or SSR runtime markers.
    const forbidden = [
      "functions",
      "_functions",
      ".vercel",
      "server",
      "server.js",
      "entry-server",
      "ssr-manifest.json",
    ]
    for (const file of files) {
      for (const marker of forbidden) {
        expect(
          file.includes(marker),
          `found server/SSR artifact "${marker}" in dist: ${file}`
        ).toBeFalsy()
      }
    }
  })
})
