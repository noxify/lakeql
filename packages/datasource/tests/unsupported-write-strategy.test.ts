import { describe, expect, it } from "vitest"

import { UnsupportedOperationError } from "../src/errors/index"
import type { DataSourceWriteInput } from "../src/types/write"
import { UnsupportedWriteStrategy } from "../src/unsupported-write-strategy"

describe("UnsupportedWriteStrategy class", () => {
  const adapter = "test-adapter"
  const dataSource = "test-ds"
  const strategy = new UnsupportedWriteStrategy({ adapter, dataSource })

  it("write() rejects with UnsupportedOperationError", async () => {
    const input: DataSourceWriteInput = {
      records: [{ id: "1" }],
      schema: {},
      config: { table: { catalog: "c", schema: "s", tableName: "t" } },
    }

    await expect(strategy.write(input)).rejects.toBeInstanceOf(
      UnsupportedOperationError
    )
  })

  it("rejected error has correct category, operation, adapter, and dataSource", async () => {
    const input: DataSourceWriteInput = {
      records: [],
      schema: null,
      config: { table: { catalog: "c", schema: "s", tableName: "t" } },
    }

    let rejection: unknown
    try {
      await strategy.write(input)
    } catch (error: unknown) {
      rejection = error
    }

    expect(rejection).toBeInstanceOf(UnsupportedOperationError)
    const opError = rejection as UnsupportedOperationError
    expect(opError.category).toBe("unsupported")
    expect(opError.operation).toBe("write")
    expect(opError.adapter).toBe(adapter)
    expect(opError.dataSource).toBe(dataSource)
  })

  it("write() does not access input records", async () => {
    const trap = new Proxy([] as Record<string, unknown>[], {
      get(_target, prop) {
        if (typeof prop === "symbol") {
          return
        }
        throw new Error(`Unexpected access to records.${String(prop)}`)
      },
      set(_target, prop) {
        throw new Error(`Unexpected write to records.${String(prop)}`)
      },
      has(_target, prop) {
        throw new Error(`Unexpected 'in' check on records.${String(prop)}`)
      },
    })

    const input = {
      records: trap,
      schema: new Proxy(
        {},
        {
          get(_target, prop) {
            if (typeof prop === "symbol") {
              return
            }
            throw new Error(`Unexpected access to schema.${String(prop)}`)
          },
        }
      ),
      config: new Proxy({} as DataSourceWriteInput["config"], {
        get(_target, prop) {
          if (typeof prop === "symbol") {
            return
          }
          throw new Error(`Unexpected access to config.${String(prop)}`)
        },
      }),
    } as DataSourceWriteInput

    let rejection: unknown
    try {
      await strategy.write(input)
    } catch (error: unknown) {
      rejection = error
    }

    expect(rejection).toBeInstanceOf(UnsupportedOperationError)
    const opError = rejection as UnsupportedOperationError
    expect(opError.category).toBe("unsupported")
    expect(opError.operation).toBe("write")
  })

  it("different adapter and dataSource values are reflected in the error", async () => {
    const custom = new UnsupportedWriteStrategy({
      adapter: "custom-db",
      dataSource: "warehouse-prod",
    })

    const input: DataSourceWriteInput = {
      records: [{ key: "val" }],
      schema: {},
      config: { table: { catalog: "c", schema: "s", tableName: "t" } },
    }

    let rejection: unknown
    try {
      await custom.write(input)
    } catch (error: unknown) {
      rejection = error
    }

    expect(rejection).toBeInstanceOf(UnsupportedOperationError)
    const opError = rejection as UnsupportedOperationError
    expect(opError.adapter).toBe("custom-db")
    expect(opError.dataSource).toBe("warehouse-prod")
  })
})
