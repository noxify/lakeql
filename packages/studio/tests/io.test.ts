import type { EndpointDefinitionFormat } from "@lakeql/schema-generator/endpoint-schema"
import { describe, expect, it, vi } from "vitest"

import type { DownloadEnvironment } from "@/core/io"
import { downloadEndpointJson, exportToJson, importFromText } from "@/core/io"
import { fromDefinition } from "@/core/mapping"
import type { EditorState } from "@/core/model"
import { createFreshState } from "@/core/model"

import { defined, expectErr, expectOk } from "./helpers"

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

function goodState(): EditorState {
  return fromDefinition(validDefinition)
}

describe("import", () => {
  it("rejects invalid JSON and reports errors (no state)", () => {
    const result = expectErr(importFromText("{ not json "))
    expect(defined(result.errors[0])).toContain("Invalid JSON")
  })

  it("rejects a schema-invalid file and reports errors (no state)", () => {
    const result = expectErr(
      importFromText(JSON.stringify({ version: "1.0", tableName: "1bad" }))
    )
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("populates state from a valid file", () => {
    const result = expectOk(importFromText(JSON.stringify(validDefinition)))
    expect(result.state.tableName).toBe("events")
    expect(result.state.fields).toHaveLength(2)
    expect(defined(result.state.fields[1]).type).toBe("Object")
    expect(result.state.mutation).toMatchObject({ enabled: true })
  })

  it("an invalid import leaves a caller's current state untouched (no partial apply)", () => {
    // Simulate the caller's apply-only-on-ok contract.
    let current = goodState()
    const result = importFromText('{"version":"1.0"}')
    if (result.ok) {
      current = result.state
    }
    // current was not replaced because the import failed.
    expect(current.tableName).toBe("events")
  })
})

describe("export gate", () => {
  it("blocks export when the state is invalid", () => {
    const invalid: EditorState = {
      ...createFreshState(),
      tableName: "1bad",
    }
    const result = expectErr(exportToJson(invalid))
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("produces minimal JSON for a valid state", () => {
    const result = expectOk(exportToJson(goodState()))
    // Round-trips back to the original definition.
    expect(JSON.parse(result.json)).toStrictEqual(validDefinition)
  })
})

describe("download path", () => {
  it("triggers a user-initiated download for a valid state", () => {
    const triggered: { url: string; filename: string }[] = []
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:fake")
    const revokeObjectURL = vi.fn<(url: string) => void>()
    const env: DownloadEnvironment = {
      createObjectURL,
      revokeObjectURL,
      triggerDownload: (url, filename) => triggered.push({ url, filename }),
    }

    const result = downloadEndpointJson(goodState(), env)
    expect(result.ok).toBeTruthy()
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(triggered).toStrictEqual([
      { url: "blob:fake", filename: "endpoint.json" },
    ])
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake")
  })

  it("does not download when export is blocked", () => {
    const env: DownloadEnvironment = {
      createObjectURL: vi.fn<(blob: Blob) => string>(() => "blob:fake"),
      revokeObjectURL: vi.fn<(url: string) => void>(),
      triggerDownload: vi.fn<(url: string, filename: string) => void>(),
    }
    const result = downloadEndpointJson(
      { ...createFreshState(), tableName: "1bad" },
      env
    )
    expect(result.ok).toBeFalsy()
    expect(env.createObjectURL).not.toHaveBeenCalled()
    expect(env.triggerDownload).not.toHaveBeenCalled()
  })
})
