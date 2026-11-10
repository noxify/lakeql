// @vitest-environment jsdom

import { readFileSync } from "node:fs"
import path from "node:path"

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// Import the BUILT library entry and the BUILT stylesheet, exactly as an
// external consumer does via `@lakeql/studio` + `@lakeql/studio/styles.css`.
// This asserts the shipped dist renders a styled component with no Tailwind
// config of the consumer's own (Req 1.1, 11.4) — against the built output, not
// the TypeScript source.
import { EndpointBuilder } from "../dist/index.mjs"

// Resolved from the package root (Vitest's cwd) rather than `import.meta.url`,
// which Vite serves as an `http:` URL under jsdom.
const studioCss = readFileSync(
  path.join(process.cwd(), "dist", "studio.css"),
  "utf-8"
)

describe("built library + styles.css renders styled (Req 1.1, 11.4)", () => {
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

    // Its root carries the theme utility classes the shipped CSS defines, so a
    // bare consumer gets the themed surface with no Tailwind config of its own.
    const themedRoot = container.querySelector(".bg-background.text-foreground")
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
})
