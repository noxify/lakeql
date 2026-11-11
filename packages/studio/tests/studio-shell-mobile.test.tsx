// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EndpointBuilder } from "@/ui/endpoint-builder"

/**
 * Component tests for the responsive / mobile navigation of the iteration-3
 * sidebar shell. They drive the real {@link EndpointBuilder} in jsdom at a
 * phone viewport, where the primary icon rail collapses to an off-canvas sheet
 * (the `useIsMobile` `768px` breakpoint) and the contextual secondary nav
 * collapses out of the layout into a header-triggered sheet (the `useIsNarrow`
 * `560px` breakpoint).
 *
 * The regression these guard: at a mobile viewport the shell previously showed
 * no way to reach the rail views — the only rail trigger lived inside the rail
 * itself, which is off-canvas on mobile — and the fixed-width secondary column
 * clipped the main content on phones. The header now carries an always-visible
 * primary-nav trigger (and, for views with a secondary panel, a contextual-nav
 * trigger) so both navigations stay reachable while the main content keeps full
 * width.
 *
 * `useIsMobile` / `useIsNarrow` derive from `window.innerWidth`, so each test
 * sets the width before rendering; the jsdom default (`1024`) is the desktop
 * path exercised by the other shell suites.
 */

/** Sets the jsdom viewport width the responsive hooks read on mount. */
function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  })
}

describe("studio shell — mobile primary navigation (≤767px)", () => {
  beforeEach(() => {
    window.localStorage.clear()
    setViewportWidth(400)
  })
  afterEach(() => {
    cleanup()
    setViewportWidth(1024)
  })

  it("exposes an always-visible header trigger that opens the rail and reaches a view", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // The rail's own trigger is off-canvas on mobile; the header carries the
    // always-visible affordance to open navigation.
    const openNav = await screen.findByRole("button", {
      name: "Open navigation",
    })
    expect(openNav).toBeDefined()

    // The rail (its view items) is not reachable until the sheet is opened.
    expect(screen.queryByRole("button", { name: "JSON" })).toBeNull()

    // Activating the header trigger opens the rail sheet, surfacing the views.
    await user.click(openNav)
    const jsonItem = await screen.findByRole("button", { name: "JSON" })

    // Selecting a view switches the main content (JSON copy action appears) —
    // navigation is reachable on mobile.
    await user.click(jsonItem)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy JSON" })).toBeDefined()
    })
  })
})

describe("studio shell — phone secondary navigation (≤560px)", () => {
  beforeEach(() => {
    window.localStorage.clear()
    setViewportWidth(400)
  })
  afterEach(() => {
    cleanup()
    setViewportWidth(1024)
  })

  it("collapses the secondary nav out of the layout and reaches it via a header trigger", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // Navigate to Fields (via the mobile primary-nav sheet). The Fields view
    // has a contextual secondary panel (the field-type palette).
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    await user.click(await screen.findByRole("button", { name: "Fields" }))

    // The palette does not occupy an inline column on phones (it would clip the
    // main content), so it is absent until its header trigger opens it.
    await waitFor(() => {
      expect(screen.getByLabelText("Field canvas")).toBeDefined()
    })
    expect(screen.queryByLabelText("Add String field")).toBeNull()

    // The contextual-nav trigger opens the palette in a sheet, keeping it
    // reachable on demand.
    const openPalette = screen.getByRole("button", {
      name: "Open Field palette",
    })
    await user.click(openPalette)
    await waitFor(() => {
      expect(screen.getByLabelText("Add String field")).toBeDefined()
    })
  })

  it("shows no contextual-nav trigger on a view without a secondary panel", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // The default Settings view has no secondary panel, so no contextual-nav
    // trigger is mounted (only the primary-nav trigger).
    expect(
      screen.getByRole("button", { name: "Open navigation" })
    ).toBeDefined()
    expect(
      screen.queryByRole("button", { name: /^Open .* palette$/u })
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Open Validation issues" })
    ).toBeNull()

    // Navigate to JSON (also no secondary panel) — still no contextual trigger.
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    await user.click(await screen.findByRole("button", { name: "JSON" }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy JSON" })).toBeDefined()
    })
    expect(
      screen.queryByRole("button", { name: "Open Validation issues" })
    ).toBeNull()
  })
})
