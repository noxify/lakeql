// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { MetadataForm } from "@/components/studio/metadata-form"
import { MutationConfigForm } from "@/components/studio/mutation-config-form"
import type { EditorApi } from "@/components/studio/use-editor"
import { EditorProvider, useEditor } from "@/components/studio/use-editor"
import {
  adapterProfile,
  createFreshState,
  EDITOR_ADAPTERS,
  exportToJson,
} from "@/core"

import { defined } from "./helpers"

/** Renders both forms under a live editor and exposes its API. */
function renderForms(): { get: () => EditorApi } {
  const bag: { editor: EditorApi | null } = { editor: null }
  const Wrapper = (): ReactNode => {
    const editor = useEditor()
    useEffect(() => {
      bag.editor = editor
    })
    return (
      <EditorProvider value={editor}>
        <MetadataForm />
        <MutationConfigForm />
      </EditorProvider>
    )
  }
  render(<Wrapper />)
  return { get: () => defined(bag.editor) }
}

describe("editor adapter profiles", () => {
  it("makes only Trino available and keeps the other adapters listed", () => {
    expect(
      EDITOR_ADAPTERS.map((profile) => [profile.id, profile.available])
    ).toStrictEqual([
      ["trino", true],
      ["fabric", false],
      ["clickhouse", false],
      ["duckdb", false],
    ])
  })

  it("explains every unavailable adapter", () => {
    const unavailable = EDITOR_ADAPTERS.filter((profile) => !profile.available)

    expect(
      unavailable.every((profile) => profile.unavailableHint !== undefined)
    ).toBeTruthy()
    expect(adapterProfile("trino").writeMethods).toStrictEqual([
      "storage",
      "insert",
    ])
  })
})

describe("adapter select", () => {
  afterEach(cleanup)

  it("starts on Trino and shows the write method control for it", () => {
    const harness = renderForms()
    act(() => {
      harness.get().setMutation({
        enabled: true,
        loadStrategy: "append",
        writeMethod: "storage",
        basePath: "",
        partitioning: false,
      })
    })

    expect(harness.get().adapter).toBe("trino")
    expect(
      screen.getByRole("combobox", { name: "Adapter" }).textContent
    ).toContain("Trino")
    expect(
      screen.getByRole("radiogroup", { name: "Write method" })
    ).toBeDefined()
  })

  it("lists the other adapters as disabled options with a hint", async () => {
    const user = userEvent.setup()
    renderForms()

    // The popup opens on keyboard activation under jsdom (no pointer/layout).
    act(() => {
      screen.getByRole("combobox", { name: "Adapter" }).focus()
    })
    await user.keyboard("{Enter}")

    const options = await screen.findAllByRole("option")
    expect(options.map((option) => option.textContent)).toStrictEqual([
      "Trino",
      "Microsoft Fabricnot supported yet",
      "ClickHousecoming soon",
      "DuckDBcoming soon",
    ])
    expect(
      options.map((option) => option.getAttribute("aria-disabled"))
    ).toStrictEqual([null, "true", "true", "true"])
  })

  it("ignores a request for an unavailable adapter", () => {
    const harness = renderForms()

    act(() => {
      harness.get().setAdapter("clickhouse")
    })

    expect(harness.get().adapter).toBe("trino")
  })
})

describe("adapter is editor-only", () => {
  it("never appears in the exported definition", () => {
    const state = {
      ...createFreshState(),
      tableName: "t",
      catalog: "c",
      schema: "s",
    }

    const result = exportToJson(state)

    expect(result.ok).toBeTruthy()
    expect(result.ok && result.json.includes("adapter")).toBeFalsy()
  })
})
