// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EndpointBuilder } from "@/components/studio/endpoint-builder"

/**
 * Component tests for the URL-hash syncing of the active shell view: the shell
 * initializes its view from an existing `window.location.hash`, switching views
 * writes the matching hash, an unknown hash falls back to General Settings, and
 * a `hashchange` event (browser back/forward or a manual address-bar edit)
 * switches the active view. jsdom backs `window.location.hash` and the
 * `hashchange` event, so these drive the real {@link EndpointBuilder} the way a
 * reload or deep link would.
 */

/** Navigates the shell to a rail view by activating its rail item. */
async function gotoView(
  user: ReturnType<typeof userEvent.setup>,
  name: "General Settings" | "Fields" | "Validations" | "JSON"
): Promise<void> {
  await user.click(screen.getByRole("button", { name }))
}

describe("studio shell — URL hash view syncing", () => {
  beforeEach(() => {
    window.localStorage.clear()
    // Reset the hash before each case so initialization is deterministic.
    window.history.replaceState(null, "", window.location.pathname)
  })
  afterEach(() => cleanup())

  it("initializes the active view from an existing hash on mount", () => {
    window.history.replaceState(null, "", "#json")
    render(<EndpointBuilder />)

    // The JSON view is active on mount (its copy action is present), not the
    // default Settings view.
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeDefined()
    expect(screen.queryByLabelText("Table name")).toBeNull()
  })

  it("falls back to General Settings for an unknown hash and leaves it untouched", () => {
    window.history.replaceState(null, "", "#foo")
    render(<EndpointBuilder />)

    // Unknown hash → Settings view (its metadata form is shown).
    expect(screen.getByLabelText("Table name")).toBeDefined()
    // The garbage hash is not rewritten until the user switches views.
    expect(window.location.hash).toBe("#foo")
  })

  it("writes the hash when the view is switched via the rail", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // Default load with no hash lands on Settings.
    expect(screen.getByLabelText("Table name")).toBeDefined()

    await gotoView(user, "Fields")
    expect(window.location.hash).toBe("#fields")

    await gotoView(user, "JSON")
    expect(window.location.hash).toBe("#json")
  })

  it("switches the active view when the hash changes externally", () => {
    render(<EndpointBuilder />)
    // Starts on Settings.
    expect(screen.getByLabelText("Table name")).toBeDefined()

    // Simulate browser back/forward or a manual address-bar edit: set the hash
    // and dispatch the hashchange event jsdom does not fire for replaceState.
    act(() => {
      window.history.replaceState(null, "", "#json")
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })

    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeDefined()
    expect(screen.queryByLabelText("Table name")).toBeNull()
  })
})
