// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { UnsupportedOperationError } from "../src/errors/index"
import type { DataSourceWriteInput } from "../src/types/write"
import { UnsupportedWriteStrategy } from "../src/unsupported-write-strategy"

/** Arbitrary `DataSourceWriteConfig` with required table coordinates. */
const arbWriteConfig = fc.record({
  table: fc.record({
    catalog: fc.string(),
    schema: fc.string(),
    tableName: fc.string(),
  }),
  loadStrategy: fc.option(
    fc.constantFrom(
      "full_load" as const,
      "full_load_append" as const,
      "append" as const
    ),
    { nil: undefined }
  ),
  basePath: fc.option(fc.string(), { nil: undefined }),
})

/** Arbitrary `DataSourceWriteInput` spanning a variety of record shapes. */
const arbWriteInput: fc.Arbitrary<DataSourceWriteInput> = fc.record({
  records: fc.array(fc.dictionary(fc.string(), fc.jsonValue())),
  schema: fc.jsonValue(),
  config: arbWriteConfig,
})

/**
 * For any adapter name, dataSource string, and DataSourceWriteInput,
 * calling `write()` on an UnsupportedWriteStrategy constructed with
 * that adapter and dataSource SHALL immediately reject with an
 * `UnsupportedOperationError` whose `category` is `"unsupported"`,
 * whose `operation` is `"write"`, and whose `adapter` and `dataSource`
 * are strictly equal to the constructor arguments, without inspecting,
 * destructuring, or otherwise accessing the input.
 */
describe("UnsupportedWriteStrategy rejection invariants", () => {
  it("write() rejects with UnsupportedOperationError carrying correct category, operation, adapter, and dataSource", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.string(),
        arbWriteInput,
        async (adapter, dataSource, input) => {
          const strategy = new UnsupportedWriteStrategy({ adapter, dataSource })

          const result = strategy.write(input)

          await expect(result).rejects.toBeInstanceOf(UnsupportedOperationError)

          let rejection: unknown
          try {
            await result
          } catch (error: unknown) {
            rejection = error
          }

          const opError = rejection as UnsupportedOperationError
          expect(opError.category).toBe("unsupported")
          expect(opError.operation).toBe("write")
          expect(opError.adapter).toBe(adapter)
          expect(opError.dataSource).toBe(dataSource)
        }
      )
    )
  })
})
