// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EndpointBuilder } from "@/components/studio/endpoint-builder"

/**
 * Tests for the desktop-only gate on {@link EndpointBuilder}. Below the
 * `768px` breakpoint a "Desktop only" notice replaces the editor unless the
 * caller opts out with `desktopOnly={false}`. The editor stays mounted
 * underneath (hidden), so a temporary resize never drops state.
 *
 * The viewport hook reads `window.innerWidth` and listens for `resize`, so each
 * test sets the width and, when resizing mid-test, dispatches `resize`.
 */

/** Sets the jsdom viewport width the responsive hooks read. */
function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  })
}

/** Resizes the jsdom viewport and notifies `resize` listeners. */
function resizeTo(width: number): void {
  act(() => {
    setViewportWidth(width)
    window.dispatchEvent(new Event("resize"))
  })
}

describe("EndpointBuilder desktop-only gate", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    cleanup()
    setViewportWidth(1024)
  })

  it("renders the editor and no notice on a desktop viewport", () => {
    setViewportWidth(1024)
    render(<EndpointBuilder />)

    expect(screen.getByRole("button", { name: "Fields" })).toBeDefined()
    expect(screen.queryByRole("heading", { name: "Desktop only" })).toBeNull()
  })

  it("shows the notice instead of the editor below the breakpoint", () => {
    setViewportWidth(400)
    render(<EndpointBuilder />)

    expect(screen.getByRole("heading", { name: "Desktop only" })).toBeDefined()
    expect(screen.getByRole("main")).toBeDefined()
    // The hidden editor is not exposed to users or assistive technology.
    expect(screen.queryByRole("button", { name: "Fields" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Open navigation" })).toBeNull()
  })

  it("renders the responsive layout when desktopOnly is false", async () => {
    setViewportWidth(400)
    render(<EndpointBuilder desktopOnly={false} />)

    expect(screen.queryByRole("heading", { name: "Desktop only" })).toBeNull()
    await expect(
      screen.findByRole("button", { name: "Open navigation" })
    ).resolves.toBeDefined()
  })

  it("switches between the notice and the editor when the window resizes", () => {
    setViewportWidth(1024)
    render(<EndpointBuilder />)
    expect(screen.queryByRole("heading", { name: "Desktop only" })).toBeNull()

    resizeTo(500)
    expect(screen.getByRole("heading", { name: "Desktop only" })).toBeDefined()

    resizeTo(1024)
    expect(screen.queryByRole("heading", { name: "Desktop only" })).toBeNull()
    expect(screen.getByRole("button", { name: "Fields" })).toBeDefined()
  })

  it("keeps editor state and undo history across a temporary resize", async () => {
    const user = userEvent.setup()
    setViewportWidth(1024)
    render(<EndpointBuilder />)

    await user.click(screen.getByRole("button", { name: "Fields" }))
    screen.getByLabelText("Add String field").focus()
    await user.keyboard("{Enter}")
    const input = screen.getByLabelText("Field name")
    await user.type(input, "kept")
    await user.tab()

    resizeTo(500)
    expect(screen.getByRole("heading", { name: "Desktop only" })).toBeDefined()
    resizeTo(1024)

    // The field survives, and the undo history is still there.
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Field name") as HTMLInputElement).value
      ).toBe("kept")
    })
    expect(
      screen.getByRole("button", { name: /undo/iu }).hasAttribute("disabled")
    ).toBeFalsy()
  })
})
