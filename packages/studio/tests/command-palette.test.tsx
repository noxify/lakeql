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

/**
 * The open command dialog's search input, found by its `data-slot` rather than
 * its placeholder (the placeholder differs between the root and Add-field
 * pages). Returns `null` when the palette is closed.
 */
function queryPaletteInput(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-slot='command-input']")
}

/** The open command dialog's search input; throws when the palette is closed. */
function paletteInput(): HTMLElement {
  const input = queryPaletteInput()
  if (input === null) {
    throw new Error("command palette input not found (palette closed?)")
  }
  return input
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

    await user.click(screen.getByRole("button", { name: "Commands" }))
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

  it("entering the Add-field sub-view highlights the first item", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Add field…"))

    // The first field-type item is the active (highlighted) one, so the group
    // heading and first option are visible without scrolling.
    const firstItem = await screen.findByText("Add String field")
    const firstRow = firstItem.closest<HTMLElement>(
      "[data-slot='command-item']"
    )
    expect(firstRow).not.toBeNull()
    await waitFor(() => {
      expect(firstRow?.dataset.selected).toBe("true")
    })
  })

  it("Escape in the Add-field sub-view returns to the main view", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Add field…"))
    await waitFor(() =>
      expect(screen.getByText("Add String field")).toBeDefined()
    )

    // Escape goes back to the root command list, not closing the palette.
    await user.keyboard("{Escape}")

    await waitFor(() => {
      expect(screen.getByText("Add field…")).toBeDefined()
    })
    // Still open, and the sub-view is gone.
    expect(paletteInput()).toBeDefined()
    expect(screen.queryByText("Add String field")).toBeNull()
  })

  it("Backspace with an empty search in the Add-field sub-view returns to the main view", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Add field…"))
    await waitFor(() =>
      expect(screen.getByText("Add String field")).toBeDefined()
    )

    // Search is empty, so Backspace backs out to the root command list rather
    // than editing the query.
    await user.keyboard("{Backspace}")

    await waitFor(() => {
      expect(screen.getByText("Add field…")).toBeDefined()
    })
    expect(paletteInput()).toBeDefined()
    expect(screen.queryByText("Add String field")).toBeNull()
  })

  it("Backspace while filtering in the Add-field sub-view edits the query, not the page", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Add field…"))
    await waitFor(() =>
      expect(screen.getByText("Add String field")).toBeDefined()
    )

    // Type a query that matches "Add Integer field", then Backspace once. The
    // search is non-empty, so Backspace edits the query ("Integer" → "Intege")
    // and the sub-view stays put rather than backing out to the root list.
    await user.type(paletteInput() as HTMLElement, "Integer")
    await waitFor(() =>
      expect(screen.getByText("Add Integer field")).toBeDefined()
    )
    await user.keyboard("{Backspace}")

    // Still on the Add-field sub-view: the Integer item remains matched by the
    // shortened query, and we have NOT returned to the root command list.
    expect(screen.getByText("Add Integer field")).toBeDefined()
    expect(screen.queryByText("Add field…")).toBeNull()
    expect((paletteInput() as HTMLInputElement).value).toBe("Intege")
  })

  it("Escape in the main view closes the palette", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())

    await user.keyboard("{Escape}")

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/type a command/iu)).toBeNull()
    })
  })

  it("the back arrow in the sub-view returns to the main view (mouse path)", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Add field…"))
    await waitFor(() =>
      expect(screen.getByText("Add String field")).toBeDefined()
    )

    // The clickable back arrow beside the input is the no-keyboard way out of
    // the sub-view (there is no longer a "Back" list entry).
    await user.click(screen.getByRole("button", { name: "Back to commands" }))

    await waitFor(() => {
      expect(screen.getByText("Add field…")).toBeDefined()
    })
    expect(screen.queryByText("Add String field")).toBeNull()
  })

  it("shows a keyboard-hint footer in the sub-view but no Back list entry", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    pressCmdK()
    await waitFor(() => expect(paletteInput()).toBeDefined())
    await user.click(screen.getByText("Add field…"))
    await waitFor(() =>
      expect(screen.getByText("Add String field")).toBeDefined()
    )

    // The footer documents the back/select shortcuts.
    const footer = document.querySelector<HTMLElement>(
      "[data-slot='command-footer']"
    )
    expect(footer).not.toBeNull()
    expect(within(footer as HTMLElement).getByText("Back")).toBeDefined()

    // The old clickable "Back" command row is gone (no list item whose text is
    // exactly "Back"); the clickable back arrow beside the input remains.
    const backRow = screen
      .queryAllByRole("option")
      .find((element) => element.textContent?.trim() === "Back")
    expect(backRow).toBeUndefined()
    expect(
      screen.getByRole("button", { name: "Back to commands" })
    ).toBeDefined()
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
