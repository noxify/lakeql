import { existsSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * These assertions run against the **built** artifacts of THIS package, not the
 * TypeScript source: the package CSS is validated as a shipped `dist/` asset
 * (Req 1.1, 11.4). They depend on `pnpm build:pkg` having run first (the
 * worktree build prerequisite the validation sequence follows), so when
 * `dist/studio.css` is absent the suite skips rather than failing — a fresh
 * unit-test job that has not built the package should not be reported as a
 * regression.
 *
 * Note: the `apps/editor` static-output check (Req 1.3, 1.5) intentionally does
 * NOT live here. A `@lakeql/studio` unit test must not reach across the package
 * boundary into an app's build output; that property belongs to `apps/editor`.
 */

const packageRoot = fileURLToPath(new URL("..", import.meta.url))
const studioCssPath = `${packageRoot}/dist/studio.css`

const builtCssAvailable = existsSync(studioCssPath)

describe.skipIf(!builtCssAvailable)("packaged CSS (Req 1.1, 11.4)", () => {
  it("ships a single precompiled studio.css in dist", () => {
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
