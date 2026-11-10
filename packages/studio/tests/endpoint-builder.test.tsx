// @vitest-environment jsdom

import type { EndpointDefinitionFormat } from "@lakeql/schema-generator/endpoint-schema"
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EndpointBuilder } from "@/ui/endpoint-builder"

/**
 * Rendered-UI integration tests for the Phase-2/3 criteria that the pure core
 * tests cannot reach (Req 8.1, 8.2, 9.1, 9.3, 3.10). They render the real
 * `EndpointBuilder` in jsdom and drive it the way a user would, so they assert
 * the wiring between the UI and the already-unit-tested core — not the core
 * logic again.
 *
 * Assertions use plain Vitest matchers over DOM properties (no `jest-dom`
 * dependency), reading `.value`/`.disabled`/`aria-checked` directly.
 */

const EXPORT_NAME = /export/iu

const validDefinition: EndpointDefinitionFormat = {
  version: "1.0",
  tableName: "events",
  catalog: "main",
  schema: "public",
  dataSource: "warehouse",
  fields: [
    { name: "id", type: "String", options: { required: true } },
    {
      name: "profile",
      type: "Object",
      fields: [{ name: "city", type: "String" }],
    },
  ],
  mutation: { loadStrategy: "append", basePath: "/data" },
}

/** Builds a `File` carrying `contents` as the user's import selection. */
function jsonFile(contents: string, name = "endpoint.json"): File {
  return new File([contents], name, { type: "application/json" })
}

/** The hidden file input the import button drives. */
function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (input === null) {
    throw new Error("file input not found")
  }
  return input
}

/** The current values of every "Field name" input in the tree. */
function fieldNameValues(): string[] {
  return screen
    .getAllByLabelText("Field name")
    .map((node) => (node as HTMLInputElement).value)
}

/** The "Field type" select at a given tree-row index. */
function typeSelectAt(index: number): HTMLElement {
  const select = screen.getAllByLabelText("Field type")[index]
  if (select === undefined) {
    throw new Error(`no field-type select at index ${index}`)
  }
  return select
}

/**
 * Opens a Base UI `Select` (a `combobox`) and picks the named option. The
 * popup opens on keyboard activation rather than a bare click under jsdom
 * (no pointer/layout), so we focus the trigger, open with Enter, then click
 * the option.
 */
async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  optionName: string
): Promise<void> {
  trigger.focus()
  await user.keyboard("{Enter}")
  const option = await screen.findByRole("option", { name: optionName })
  await user.click(option)
}

describe("EndpointBuilder rendered-UI integration", () => {
  beforeEach(() => {
    // Each test starts from empty persistence so the fresh default seeds.
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  describe("import into the rendered builder (Req 9.1, 9.3)", () => {
    it("populates the tree, metadata, and mutation from a valid file", async () => {
      const user = userEvent.setup()
      render(<EndpointBuilder />)

      await user.upload(fileInput(), jsonFile(JSON.stringify(validDefinition)))

      // Metadata is populated.
      await waitFor(() => {
        expect(
          (screen.getByLabelText("Table name") as HTMLInputElement).value
        ).toBe("events")
      })
      expect((screen.getByLabelText("Catalog") as HTMLInputElement).value).toBe(
        "main"
      )

      // The tree is populated — the two top-level field names are present.
      expect(fieldNameValues()).toContain("id")
      expect(fieldNameValues()).toContain("profile")

      // Mutation was enabled from the file.
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
        "true"
      )
    })

    it("rejects a malformed file, shows errors, and leaves state untouched (no partial apply)", async () => {
      const user = userEvent.setup()
      render(<EndpointBuilder />)

      // First import a valid file so there is real state to protect.
      await user.upload(fileInput(), jsonFile(JSON.stringify(validDefinition)))
      await waitFor(() => {
        expect(
          (screen.getByLabelText("Table name") as HTMLInputElement).value
        ).toBe("events")
      })

      // Then import a broken file.
      await user.upload(fileInput(), jsonFile("{ not valid json "))

      // The error surfaces...
      await waitFor(() => {
        expect(screen.getByText("Import failed")).toBeDefined()
      })
      // ...and the previously imported state is intact (no partial apply).
      expect(
        (screen.getByLabelText("Table name") as HTMLInputElement).value
      ).toBe("events")
      expect(fieldNameValues()).toContain("profile")
    })
  })

  describe("export button gating (Req 8.1, 8.2)", () => {
    it("is blocked while the definition is invalid and unblocked once it is valid", async () => {
      const user = userEvent.setup()
      render(<EndpointBuilder />)

      // Make the definition invalid: a table name with a leading digit
      // violates the metadata pattern, so the gate blocks export.
      const tableName = screen.getByLabelText("Table name") as HTMLInputElement
      await user.clear(tableName)
      await user.type(tableName, "1bad")

      await waitFor(() => {
        const button = screen.getByRole("button", {
          name: EXPORT_NAME,
        }) as HTMLButtonElement
        expect(button.disabled).toBeTruthy()
      })

      // Importing a valid file replaces the invalid state and unblocks export.
      await user.upload(fileInput(), jsonFile(JSON.stringify(validDefinition)))

      await waitFor(() => {
        const button = screen.getByRole("button", {
          name: EXPORT_NAME,
        }) as HTMLButtonElement
        expect(button.disabled).toBeFalsy()
      })
    })
  })

  describe("type-change confirmation dialog (Req 3.10)", () => {
    it("appears on a lossy transition and applies only on confirm", async () => {
      const user = userEvent.setup()
      render(<EndpointBuilder />)

      // Import a definition with a populated Object so a change is lossy.
      await user.upload(fileInput(), jsonFile(JSON.stringify(validDefinition)))
      await waitFor(() => {
        expect(
          (screen.getByLabelText("Table name") as HTMLInputElement).value
        ).toBe("events")
      })

      // The "profile" row is the Object with a child; find its type select by
      // matching the row index of the "profile" name input.
      const profileIndex = fieldNameValues().indexOf("profile")
      expect(profileIndex).toBeGreaterThanOrEqual(0)

      // Change Object -> String: a lossy transition (drops the child field).
      await selectOption(user, typeSelectAt(profileIndex), "String")

      // The confirmation dialog appears and names what is lost.
      const dialog = await screen.findByRole("alertdialog")
      expect(within(dialog).getByText("Discard structural data?")).toBeDefined()

      // Decline first: the field stays an Object (its "city" child survives).
      await user.click(
        within(dialog).getByRole("button", { name: "Keep field" })
      )
      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).toBeNull()
      })
      expect(fieldNameValues()).toContain("city")

      // Trigger the lossy change again and confirm this time.
      await selectOption(user, typeSelectAt(profileIndex), "String")
      const dialog2 = await screen.findByRole("alertdialog")
      await user.click(
        within(dialog2).getByRole("button", { name: "Discard and change" })
      )

      // The child is gone -> the change applied on confirm.
      await waitFor(() => {
        expect(fieldNameValues()).not.toContain("city")
      })
    })
  })
})
