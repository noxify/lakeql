// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EndpointBuilder } from "@/ui/endpoint-builder"

/**
 * Component tests for the Phase C command palette: the ⌘K open path, the
 * command list, navigation routing, the export gate, the confirmed reset, and
 * the Add-field sub-view. They drive the real {@link EndpointBuilder} DOM in
 * jsdom the way a user would.
 */

/** Opens the palette by dispatching the global ⌘K shortcut on the window. */
function pressCmdK(): void {
  act(() => {
    fireEvent.keyDown(window, { key: "k", metaKey: true })
  })
}

/** The open command dialog's search input. */
function paletteInput(): HTMLElement {
  return screen.getByPlaceholderText(/type a command/iu)
}

describe("command palette — open and run", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it("opens on ⌘K and lists the commands", async () => {
    render(<EndpointBuilder />)

    // Closed initially: no search input.
    expect(screen.queryByPlaceholderText(/type a command/iu)).toBeNull()

    pressCmdK()

    await waitFor(() => {
      expect(paletteInput()).toBeDefined()
    })

    // Every expected command is listed.
    const labels = [
      "Go to Fields",
      "Go to Validations",
      "Import…",
      "Show open validations",
      "Add field…",
      "Reset editor…",
    ]
    const present = labels.filter((label) => screen.queryByText(label) !== null)
    expect(present).toStrictEqual(labels)
  })

  it("toggles closed on a second ⌘K", async () => {
    render(<EndpointBuilder />)

    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())

    pressCmdK()
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/type a command/iu)).toBeNull()
    })
  })

  it("the visible header affordance opens the palette", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    await user.click(
      screen.getByRole("button", { name: "Open command palette" })
    )
    await waitFor(() => expect(paletteInput()).toBeDefined())
  })

  it("a navigation command routes to the target view", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // Default view is Settings; navigate to JSON through the palette.
    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Go to JSON"))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy JSON" })).toBeDefined()
    })
  })

  it("Add field opens the sub-view and inserts the chosen type", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Add field…"))

    // The sub-view lists the eight field types.
    await waitFor(() => {
      expect(screen.getByText("Add String field")).toBeDefined()
    })
    expect(screen.getByText("Add Object field")).toBeDefined()
    expect(screen.getByText("Add Array field")).toBeDefined()

    await user.click(screen.getByText("Add Boolean field"))

    // The palette closed and the field landed (seen on the Fields view).
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/type a command/iu)).toBeNull()
    })
    await user.click(screen.getByRole("button", { name: "Fields" }))
    await waitFor(() => {
      expect(screen.getAllByLabelText("Field name")).toHaveLength(1)
    })
  })

  it("Reset editor confirms before clearing, then clears the definition", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // Add a field first so there is something to clear.
    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Add field…"))
    await waitFor(() =>
      expect(screen.getByText("Add String field")).toBeDefined()
    )
    await user.click(screen.getByText("Add String field"))
    await user.click(screen.getByRole("button", { name: "Fields" }))
    await waitFor(() => {
      expect(screen.getAllByLabelText("Field name")).toHaveLength(1)
    })

    // Open the palette and choose Reset editor → the confirm dialog appears.
    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Reset editor…"))

    const dialog = await screen.findByRole("alertdialog")
    expect(
      within(dialog).getByRole("heading", { name: "Reset the editor?" })
    ).toBeDefined()

    await user.click(
      within(dialog).getByRole("button", { name: "Reset editor" })
    )

    // The field list is cleared.
    await waitFor(() => {
      expect(screen.queryAllByLabelText("Field name")).toHaveLength(0)
    })
  })

  it("Reset editor cancellation keeps the definition", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Add field…"))
    await waitFor(() =>
      expect(screen.getByText("Add String field")).toBeDefined()
    )
    await user.click(screen.getByText("Add String field"))
    await user.click(screen.getByRole("button", { name: "Fields" }))
    await waitFor(() => {
      expect(screen.getAllByLabelText("Field name")).toHaveLength(1)
    })

    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Reset editor…"))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: "Keep editing" })
    )

    // The field survives the declined reset.
    await waitFor(() => {
      expect(screen.getAllByLabelText("Field name")).toHaveLength(1)
    })
  })
})

describe("command palette — export gate", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it("disables Export while the definition is invalid for export", async () => {
    render(<EndpointBuilder />)

    // A fresh definition is incomplete, so Export is gated in the palette.
    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())

    const exportItem = screen
      .getByText(/Export \(/u)
      .closest<HTMLElement>("[data-slot='command-item']")
    expect(exportItem).not.toBeNull()
    expect(exportItem?.dataset.disabled).toBe("true")
  })
})
