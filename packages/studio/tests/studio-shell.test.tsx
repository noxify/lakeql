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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EndpointBuilder } from "@/ui/endpoint-builder"

import { defined } from "./helpers"

/**
 * Component tests for the iteration-3 sidebar shell (Phase C/D): rail view
 * switching, the Fields-view palette/canvas co-location under one hoisted
 * `DndContext`, the live field badge, the Validations summary + jump-to-field,
 * the JSON copy action, and the empty state. They drive the real
 * {@link EndpointBuilder} DOM in jsdom the way a user would (the sidebar lands
 * on General Settings by default). The pointer-drag drop-handler path is
 * covered at the decomposed level in `canvas.test.tsx`; here the palette→canvas
 * add is exercised through the shell via the keyboard-add affordance, which
 * routes through the same hoisted context the drag uses.
 */

/** Navigates the shell to a rail view by activating its rail item. */
async function gotoView(
  user: ReturnType<typeof userEvent.setup>,
  name: "General Settings" | "Fields" | "Validations" | "JSON"
): Promise<void> {
  await user.click(screen.getByRole("button", { name }))
}

/** The current "Field name" input values on the canvas, in order. */
function fieldNameValues(): string[] {
  return screen
    .getAllByLabelText("Field name")
    .map((node) => (node as HTMLInputElement).value)
}

/** Builds a `File` carrying `contents` as the user's import selection. */
function jsonFile(contents: string, name = "endpoint.json"): File {
  return new File([contents], name, { type: "application/json" })
}

/** The header's hidden file input the Import button drives. */
function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (input === null) {
    throw new Error("file input not found")
  }
  return input
}

/**
 * A valid definition whose single String field carries an unconstructible
 * regex. The field keys a `BadRegexDiagnostic`, so it drives a canvas badge and
 * a navigable Validations entry without touching the validations editor UI.
 */
const badRegexDefinition = JSON.stringify({
  version: "1.0",
  tableName: "events",
  catalog: "main",
  schema: "public",
  fields: [
    {
      name: "zip",
      type: "String",
      options: { validations: [{ type: "regex", pattern: "(" }] },
    },
  ],
  mutation: false,
})

describe("studio shell — rail and views", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it("lands on General Settings and switches views from the rail", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // Default view: the metadata form (Settings) is shown.
    expect(screen.getByLabelText("Table name")).toBeDefined()

    // Switch to JSON: the JSON copy action appears.
    await gotoView(user, "JSON")
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeDefined()

    // Switch to Fields: the palette and the canvas are both present.
    await gotoView(user, "Fields")
    expect(screen.getByLabelText("Add String field")).toBeDefined()
    expect(screen.getByLabelText("Field canvas")).toBeDefined()
  })

  it("Fields view co-locates the palette (secondary sidebar) and canvas (main content) and a palette add inserts a field", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)
    await gotoView(user, "Fields")

    // The palette lives in the "Field palette" secondary sidebar region; the
    // canvas lives in the main content — both under one hoisted DndContext.
    const palette = screen.getByRole("complementary", { name: "Field palette" })
    expect(within(palette).getByLabelText("Add String field")).toBeDefined()

    // Starts empty, so the empty state is shown and no fields exist yet.
    expect(screen.getByRole("note", { name: "No fields yet" })).toBeDefined()

    // Add a field through the palette's keyboard affordance (the palette→canvas
    // add path through the shared context). The canvas then renders a node.
    const addString = within(palette).getByLabelText("Add String field")
    addString.focus()
    await user.keyboard("{Enter}")

    expect(fieldNameValues()).toHaveLength(1)
    // The empty state disappears once a field exists.
    expect(screen.queryByRole("note", { name: "No fields yet" })).toBeNull()
  })

  it("exposes the keyboard-move hint in the Fields view", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)
    await gotoView(user, "Fields")

    const hint = screen.getByRole("note", { name: "Keyboard move help" })
    expect(within(hint).getByText(/pick up/u)).toBeDefined()
    expect(within(hint).getByText(/cancel/u)).toBeDefined()
  })
})

describe("studio shell — field validation badges", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it("shows a badge on a field with an issue and clears it live when fixed", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // Import a definition whose field carries an unconstructible regex, then
    // switch to the Fields view to see the canvas node.
    await user.upload(fileInput(), jsonFile(badRegexDefinition))
    await gotoView(user, "Fields")

    // The badged field is on the canvas; selecting it shows the readable detail.
    await waitFor(() => {
      expect(screen.getByLabelText("has validation issue")).toBeDefined()
    })
    const selectButtons = screen.getAllByLabelText("Select field")
    await user.click(defined(selectButtons[0]))
    expect(
      screen.getByText(/Validation pattern is not a valid regular expression/u)
    ).toBeDefined()

    // Fixing the pattern clears the badge live (derived from evaluate()).
    const regexInput = screen.getByLabelText("Regex pattern")
    await user.clear(regexInput)
    await user.type(regexInput, "abc")
    await waitFor(() => {
      expect(screen.queryByLabelText("has validation issue")).toBeNull()
    })
  })
})

describe("studio shell — Validations summary and jump-to-field", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it("renders readable entries and a click jumps to and selects the field", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // Import a definition carrying a navigable (field-keyed) bad-regex issue.
    await user.upload(fileInput(), jsonFile(badRegexDefinition))

    // Open the Validations view: the readable entry is listed.
    await gotoView(user, "Validations")
    const issueList = screen.getByRole("complementary", {
      name: "Validation issues",
    })
    expect(
      within(issueList).getByText(
        /Validation pattern is not a valid regular expression/u
      )
    ).toBeDefined()

    // Clicking the entry jumps to the Fields view and selects the field — its
    // name input is present again (we are back on the canvas).
    const entry = within(issueList).getByRole("button", { name: /zip/u })
    await user.click(entry)

    await waitFor(() => {
      expect(screen.getByLabelText("Field canvas")).toBeDefined()
    })
    // The jumped-to field is selected (its name input value survives).
    expect(fieldNameValues()).toContain("zip")
  })

  it("shows a ready-to-export state when there are no issues", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // Import a fully valid definition so the gate reports no issues.
    await user.upload(
      fileInput(),
      jsonFile(
        JSON.stringify({
          version: "1.0",
          tableName: "events",
          catalog: "main",
          schema: "public",
          fields: [{ name: "id", type: "String" }],
          mutation: false,
        })
      )
    )
    await gotoView(user, "Validations")

    await waitFor(() => {
      expect(
        screen.getByRole("note", { name: "Ready to export" })
      ).toBeDefined()
    })
  })
})

describe("studio shell — logo, header affordances, content-fixed toolbar, global shortcut", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it("renders the labelled LakeQL logo in the sidebar header without colliding with rail button queries", () => {
    render(<EndpointBuilder />)

    // The logo is an accessible image, not a button, so the rail's
    // `getByRole("button", { name })` queries are unaffected.
    expect(screen.getByRole("img", { name: "LakeQL logo" })).toBeDefined()
    // The rail items are still uniquely resolvable by their button names.
    expect(screen.getByRole("button", { name: "Fields" })).toBeDefined()
    expect(screen.getByRole("button", { name: "JSON" })).toBeDefined()
  })

  it("keeps the desktop rail a slim fixed icon column: no in-rail expand/collapse trigger and no wordmark", () => {
    // The jsdom default viewport (1024px) is the desktop path, where the rail
    // is a fixed icon-only column (`collapsible="none"`) — not the mobile
    // off-canvas sheet. It must carry no expand/collapse chrome: the shadcn
    // in-rail trigger renders an "Toggle Sidebar" button, which must be absent
    // here (the only sidebar trigger is the header's `md:hidden` "Open
    // navigation" one, for mobile). The rail header shows just the logo, with
    // no separate wordmark text beside it.
    render(<EndpointBuilder />)

    // No in-rail expand/collapse trigger on desktop.
    expect(screen.queryByRole("button", { name: "Toggle Sidebar" })).toBeNull()
    // The rail header renders the logo image and nothing else text-wise — no
    // wordmark label (the logo SVG already carries the brand, `aria-label`
    // "LakeQL logo"), so no "LakeQL" text node sits beside it.
    expect(screen.getByRole("img", { name: "LakeQL logo" })).toBeDefined()
    expect(screen.queryByText("LakeQL")).toBeNull()
  })

  it("wires the global-header affordances (theme toggle + ⌘K command palette) into the shell on every view", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // The theme toggle and the ⌘K palette affordance are mounted in the global
    // header, so they are present regardless of the active view — assert them
    // on the default Settings view and after navigating to Fields. The deep
    // behavior of each lives in `theme-toggle.test.tsx` / `command-palette.test.tsx`;
    // this is the shell-wiring check that the header actually renders them.
    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Commands" })).toBeDefined()

    await gotoView(user, "Fields")
    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Commands" })).toBeDefined()
  })

  it("shows the issue count only in the global header (no inline validation alert)", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // Import a definition carrying one field-keyed issue so the gate blocks
    // export and the header count is non-zero.
    await user.upload(fileInput(), jsonFile(badRegexDefinition))

    // The compact validity span in the global header is the single count
    // surface — "N issue(s) blocking export". It is a plain status span, not a
    // destructive `role="alert"`: the redundant raw-diagnostics alert was
    // removed, so no alert is announced for the count.
    await waitFor(() => {
      expect(screen.getByText(/1 issue blocking export/u)).toBeDefined()
    })
    expect(
      screen.queryByText(
        /Validation pattern is not a valid regular expression/u,
        { selector: '[role="alert"] *' }
      )
    ).toBeNull()
    // The details still live in the Validations view, not a header alert.
    await gotoView(user, "Validations")
    const issueList = screen.getByRole("complementary", {
      name: "Validation issues",
    })
    expect(
      within(issueList).getByText(
        /Validation pattern is not a valid regular expression/u
      )
    ).toBeDefined()
  })

  it("shows the Undo/Redo toolbar in the Fields view and nowhere else", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // Settings (default) has no content-fixed Undo/Redo toolbar.
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Redo" })).toBeNull()

    // Fields view shows the toolbar buttons.
    await gotoView(user, "Fields")
    expect(screen.getByRole("button", { name: "Undo" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Redo" })).toBeDefined()

    // JSON view drops it again.
    await gotoView(user, "JSON")
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()
  })

  it("keyboard undo/redo works on a non-Fields view (global shortcut)", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    // Commit a field by importing a one-field definition (one undoable step).
    await user.upload(
      fileInput(),
      jsonFile(
        JSON.stringify({
          version: "1.0",
          tableName: "events",
          catalog: "main",
          schema: "public",
          fields: [{ name: "id", type: "String" }],
          mutation: false,
        })
      )
    )

    // Confirm the field landed (seen on the Fields view).
    await gotoView(user, "Fields")
    await waitFor(() => {
      expect(fieldNameValues()).toContain("id")
    })

    // Navigate to a NON-Fields view (Settings). The Undo/Redo buttons are
    // absent here, but the global keyboard shortcut (mounted at the shell root
    // via useUndoRedoShortcuts) must still undo. Dispatch on the window — the
    // target is not a text-entry control, so the shortcut is not ignored.
    await gotoView(user, "General Settings")
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()

    act(() => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true })
    })

    // Back on Fields the field list is empty (no "Field name" inputs). Use a
    // query that tolerates zero matches rather than the throwing getAll.
    await gotoView(user, "Fields")
    await waitFor(() => {
      expect(screen.queryAllByLabelText("Field name")).toHaveLength(0)
    })

    // Ctrl+Shift+Z from a non-Fields view redoes it.
    await gotoView(user, "General Settings")
    act(() => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true })
    })

    await gotoView(user, "Fields")
    await waitFor(() => {
      expect(fieldNameValues()).toContain("id")
    })
  })
})

describe("studio shell — JSON copy", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => cleanup())

  it("copies the live JSON to the clipboard", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)
    await gotoView(user, "JSON")

    // `userEvent.setup()` installs a clipboard stub; spy on its writeText so the
    // copy action's call is observed rather than replacing the whole clipboard.
    const writeText = vi.spyOn(navigator.clipboard, "writeText")

    await user.click(screen.getByRole("button", { name: "Copy JSON" }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce()
    })
    const copied = defined(writeText.mock.calls[0])[0] as string
    // The copied text is the serialized candidate definition.
    expect(copied).toContain('"version"')
    expect(copied).toContain('"tableName"')
    writeText.mockRestore()
  })
})
