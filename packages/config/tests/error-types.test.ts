// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable vitest/max-expects

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  RuntimeConstructionError,
  UnknownDataSourceError,
  WriteStrategyNotConfiguredError,
} from "../src/index"

describe("Public error structural contracts", () => {
  describe("Public error class structural contract", () => {
    /**
     * For any sourceName string and configuredSourceNames string array,
     * constructing UnknownDataSourceError produces an instance that passes
     * `instanceof Error` and `instanceof UnknownDataSourceError`, has
     * `name === "UnknownDataSourceError"`, and exposes `sourceName` and
     * `configuredSourceNames` as readonly fields matching the provided values.
     */
    it("UnknownDataSourceError has correct class identity and fields", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.array(fc.string({ minLength: 1 })),
          (sourceName, configuredSourceNames) => {
            const error = new UnknownDataSourceError(
              sourceName,
              configuredSourceNames
            )

            expect(error).toBeInstanceOf(Error)
            expect(error).toBeInstanceOf(UnknownDataSourceError)
            expect(error.name).toBe("UnknownDataSourceError")
            expect(error.sourceName).toBe(sourceName)
            expect([...error.configuredSourceNames]).toStrictEqual(
              configuredSourceNames
            )
            expect(error.message).toContain(sourceName)
          }
        )
      )
    })

    /**
     * For any sourceName string, adapterName string, and cause value,
     * constructing RuntimeConstructionError produces an instance that passes
     * `instanceof Error` and `instanceof RuntimeConstructionError`, has
     * `name === "RuntimeConstructionError"`, and exposes `sourceName`,
     * `adapterName`, and `cause` as readonly fields matching the provided values.
     */
    it("RuntimeConstructionError has correct class identity and fields", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.oneof(
            fc.string(),
            fc.constant(new Error("test cause")),
            fc.constant(null),
            // oxlint-disable-next-line unicorn/no-useless-undefined -- cause can genuinely be undefined
            fc.constant(undefined)
          ),
          (sourceName, adapterName, cause) => {
            const error = new RuntimeConstructionError(
              sourceName,
              adapterName,
              cause
            )

            expect(error).toBeInstanceOf(Error)
            expect(error).toBeInstanceOf(RuntimeConstructionError)
            expect(error.name).toBe("RuntimeConstructionError")
            expect(error.sourceName).toBe(sourceName)
            expect(error.adapterName).toBe(adapterName)
            expect(error.cause).toBe(cause)
            expect(error.message).toContain(sourceName)
            expect(error.message).toContain(adapterName)
          }
        )
      )
    })

    /**
     * For any sourceName string, constructing WriteStrategyNotConfiguredError
     * produces an instance that passes `instanceof Error` and
     * `instanceof WriteStrategyNotConfiguredError`, has
     * `name === "WriteStrategyNotConfiguredError"`, and exposes `sourceName`
     * as a readonly field matching the provided value.
     */
    it("WriteStrategyNotConfiguredError has correct class identity and fields", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (sourceName) => {
          const error = new WriteStrategyNotConfiguredError(sourceName)

          expect(error).toBeInstanceOf(Error)
          expect(error).toBeInstanceOf(WriteStrategyNotConfiguredError)
          expect(error.name).toBe("WriteStrategyNotConfiguredError")
          expect(error.sourceName).toBe(sourceName)
          expect(error.message).toContain(sourceName)
        })
      )
    })

    /**
     * WriteStrategyNotConfiguredError SHALL NOT pass instanceof
     * UnknownDataSourceError, confirming they are distinct error classes.
     */
    it("WriteStrategyNotConfiguredError is not an instance of UnknownDataSourceError", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (sourceName) => {
          const error = new WriteStrategyNotConfiguredError(sourceName)
          expect(error).not.toBeInstanceOf(UnknownDataSourceError)
        })
      )
    })
  })

  describe("Defensive frozen snapshot of configuredSourceNames", () => {
    /**
     * For any mutable array of source-name strings passed during
     * UnknownDataSourceError construction, the error's `configuredSourceNames`
     * field SHALL be a frozen (`Object.isFrozen`) array.
     */
    it("configuredSourceNames is frozen", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.array(fc.string({ minLength: 1 })),
          (sourceName, configuredSourceNames) => {
            const error = new UnknownDataSourceError(
              sourceName,
              configuredSourceNames
            )
            expect(Object.isFrozen(error.configuredSourceNames)).toBeTruthy()
          }
        )
      )
    })

    /**
     * Mutating the original input array after construction does not affect
     * the error's `configuredSourceNames` field.
     */
    it("mutating the original array after construction does not affect configuredSourceNames", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
          (sourceName, configuredSourceNames) => {
            const mutableInput = [...configuredSourceNames]
            const expectedSnapshot = [...configuredSourceNames]
            const error = new UnknownDataSourceError(sourceName, mutableInput)

            // Mutate the original input
            mutableInput.push("injected-after-construction")
            mutableInput[0] = "replaced-after-construction"
            mutableInput.pop()

            expect([...error.configuredSourceNames]).toStrictEqual(
              expectedSnapshot
            )
          }
        )
      )
    })

    /**
     * Attempting to mutate the `configuredSourceNames` array (push) either
     * throws or has no effect — the field remains unchanged.
     */
    it("attempting to mutate configuredSourceNames has no effect", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.array(fc.string({ minLength: 1 })),
          (sourceName, configuredSourceNames) => {
            const error = new UnknownDataSourceError(
              sourceName,
              configuredSourceNames
            )
            const expectedSnapshot = [...error.configuredSourceNames]

            try {
              ;(error.configuredSourceNames as string[]).push("mutated")
            } catch {
              // Object.freeze throws in strict mode — acceptable
            }

            expect([...error.configuredSourceNames]).toStrictEqual(
              expectedSnapshot
            )
          }
        )
      )
    })
  })
})
