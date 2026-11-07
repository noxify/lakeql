// oxlint-disable import/first vitest/require-mock-type-parameters
import { describe, expect, it, vi } from "vitest"

const { mockResolveDataSource, mockResolveCatalog, closeSpy } = vi.hoisted(
  () => {
    const close = vi.fn().mockResolvedValue(undefined)
    return {
      closeSpy: close,
      mockResolveDataSource: vi.fn(),
      mockResolveCatalog: vi.fn(),
    }
  }
)

vi.mock(import("../../src/resolve-datasource"), () => ({
  resolveDataSource: mockResolveDataSource,
}))
vi.mock(import("../../src/resolve-catalog"), () => ({
  resolveCatalog: mockResolveCatalog,
}))

import listSchemasCommand from "../../src/commands/list-schemas"

describe("list-schemas resource cleanup", () => {
  it("closes the data source even when catalog resolution fails", async () => {
    closeSpy.mockClear()
    mockResolveDataSource.mockResolvedValue({
      instance: { close: closeSpy, schemas: vi.fn() },
      config: { connection: {} },
    })
    // resolveCatalog makes a network call (dataSource.catalogs()) and can throw.
    mockResolveCatalog.mockRejectedValue(new Error("network down"))

    const program = listSchemasCommand()

    await expect(
      program.parseAsync(["--source", "warehouse"], { from: "user" })
    ).rejects.toThrow("network down")

    expect(closeSpy).toHaveBeenCalledOnce()
  })
})
