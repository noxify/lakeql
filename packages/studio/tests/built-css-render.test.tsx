// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { cleanup, render } from "@testing-library/react"
import type { ComponentType } from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

// These assertions run against the BUILT library entry and the BUILT
// stylesheet, exactly as an external consumer uses `@lakeql/studio` +
// `@lakeql/studio/styles.css` (Req 1.1, 11.4). They depend on `pnpm build:pkg`
// having produced `dist/`, so the suite skips when the build output is absent
// rather than failing a fresh unit-test job.

const distDir = path.join(process.cwd(), "dist")
const studioCssPath = path.join(distDir, "studio.css")
const libEntryPath = path.join(distDir, "index.mjs")

const builtOutputAvailable =
  existsSync(studioCssPath) && existsSync(libEntryPath)

describe.skipIf(!builtOutputAvailable)(
  "built library + styles.css renders styled (Req 1.1, 11.4)",
  () => {
    let EndpointBuilder: ComponentType
    let studioCss: string

    beforeAll(async () => {
      // Dynamic import so the test module itself loads even when dist is
      // absent (the describe is skipped in that case).
      ;({ EndpointBuilder } = (await import(
        /* @vite-ignore */ libEntryPath
      )) as {
        EndpointBuilder: ComponentType
      })
      studioCss = readFileSync(studioCssPath, "utf-8")
    })

    beforeEach(() => {
      window.localStorage.clear()
      // Inject the shipped stylesheet the way a consumer's bundler would, with
      // no Tailwind setup of our own in this test.
      const style = document.createElement("style")
      style.id = "studio-css"
      style.textContent = studioCss
      document.head.append(style)
    })

    afterEach(() => {
      cleanup()
      document.querySelector("#studio-css")?.remove()
    })

    it("mounts the built EndpointBuilder and renders the themed root with its utility classes", () => {
      const { container } = render(<EndpointBuilder />)

      // The built component mounted and produced real markup.
      const heading = container.querySelector("h1")
      expect(heading?.textContent).toContain("Endpoint Builder")

      // Its root carries the theme utility classes the shipped CSS defines, so
      // a bare consumer gets the themed surface with no Tailwind config.
      const themedRoot = container.querySelector(
        ".bg-background.text-foreground"
      )
      expect(themedRoot).not.toBeNull()
    })

    it("ships the CSS rules backing those classes, so the consumer needs no Tailwind config", () => {
      // The injected stylesheet actually defines the theme tokens and the
      // utilities the component uses — not just class attributes with no rules.
      expect(studioCss).toContain("--background")
      expect(studioCss).toContain("--foreground")
      // The utility selectors are emitted (minified; each is followed by a rule
      // block or grouped with another selector).
      expect(studioCss).toMatch(/\.bg-background\s*[,{]/u)
      expect(studioCss).toMatch(/\.text-foreground\s*[,{]/u)
    })
  }
)
