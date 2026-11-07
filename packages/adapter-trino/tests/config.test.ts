// oxlint-disable vitest/max-expects
// oxlint-disable vitest/no-conditional-expect
// oxlint-disable import/no-named-as-default-member

import { DataSourceError } from "@lakeql/datasource"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { validateTrinoConfig } from "../src/config"

// ---------------------------------------------------------------------------
// Arbitraries — valid building blocks
// ---------------------------------------------------------------------------

/** Non-empty string that avoids trivial empty values. */
const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 64 })

/** Valid port: integer in 1–65_535. */
const arbValidPort = fc.integer({ min: 1, max: 65_535 })

/** Valid basic auth object. */
const arbBasicAuth = fc.record({
  type: fc.constant("basic" as const),
  username: arbNonEmptyString,
  password: arbNonEmptyString,
})

/** Valid bearer auth object. */
const arbBearerAuth = fc.record({
  type: fc.constant("bearer" as const),
  token: arbNonEmptyString,
})

/** Valid auth: either basic or bearer. */
const arbValidAuth = fc.oneof(arbBasicAuth, arbBearerAuth)

/** Valid TrinoConnectionConfig with all required fields. */
const arbValidConfig = fc.record(
  {
    host: arbNonEmptyString,
    port: arbValidPort,
    catalog: arbNonEmptyString,
    auth: arbValidAuth,
    schema: arbNonEmptyString,
    source: arbNonEmptyString,
    timeout: fc.double({ min: 0.001, max: 1_000_000_000, noNaN: true }),
    retry: fc.record({}),
  },
  { requiredKeys: ["host", "port", "catalog", "auth"] }
)

// ---------------------------------------------------------------------------
// Arbitraries — invalid building blocks
// ---------------------------------------------------------------------------

/** Invalid port values: outside 1–65_535, NaN, Infinity, floats. */
const arbInvalidPort = fc.oneof(
  fc.constant(0),
  fc.constant(-1),
  fc.constant(65_536),
  fc.constant(70_000),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
  fc
    .double({ min: 1.01, max: 65_534.99, noNaN: true })
    .filter((n) => !Number.isInteger(n))
)

/** Invalid timeout values. */
const arbInvalidTimeout = fc.oneof(
  fc.constant(0),
  fc.constant(-1),
  fc.constant(-100),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY)
)

/** Non-object root inputs. */
const arbNonObject = fc.oneof(
  fc.constant(null),
  fc.constant(null), // placeholder for the undefined slot
  fc.integer(),
  fc.string(),
  fc.boolean(),
  fc.constant([]),
  fc.constant([1, 2, 3])
)

// ---------------------------------------------------------------------------
// Configuration validation completeness
// ---------------------------------------------------------------------------

/**
 * For any `unknown` connection payload, `validateTrinoConfig()` SHALL
 * either return normally after proving the value is a valid
 * `TrinoConnectionConfig` or throw synchronously with a plain `Error`
 * (not `DataSourceError`). It SHALL validate non-null plain object shape,
 * required fields, port bounds, non-empty strings, auth shape, optional
 * field constraints, and credential safety in error messages.
 */
describe("Configuration validation completeness", () => {
  it("accepts any valid TrinoConnectionConfig", () => {
    fc.assert(
      fc.property(arbValidConfig, (config) => {
        // Should not throw for valid configs
        expect(() => validateTrinoConfig(config)).not.toThrow()
      }),
      { numRuns: 200 }
    )
  })

  it("rejects non-object root values with a plain Error", () => {
    fc.assert(
      fc.property(arbNonObject, (input) => {
        expect(() => validateTrinoConfig(input)).toThrow(Error)
        expect(() => validateTrinoConfig(input)).not.toThrow(DataSourceError)
      })
    )
  })

  it("rejects undefined root value with a plain Error", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined -- explicitly testing undefined input
    expect(() => validateTrinoConfig(undefined)).toThrow(Error)
    // eslint-disable-next-line unicorn/no-useless-undefined -- explicitly testing undefined input
    expect(() => validateTrinoConfig(undefined)).not.toThrow(DataSourceError)
  })

  it("rejects configs with invalid port values", () => {
    fc.assert(
      fc.property(
        arbValidConfig.chain((base) =>
          arbInvalidPort.map((port) => ({ ...base, port }))
        ),
        (config) => {
          expect(() => validateTrinoConfig(config)).toThrow(/port/iu)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("rejects configs with empty host", () => {
    fc.assert(
      fc.property(
        arbValidConfig.map((base) => ({ ...base, host: "" })),
        (config) => {
          expect(() => validateTrinoConfig(config)).toThrow(/host/iu)
        }
      )
    )
  })

  it("rejects configs with empty catalog", () => {
    fc.assert(
      fc.property(
        arbValidConfig.map((base) => ({ ...base, catalog: "" })),
        (config) => {
          expect(() => validateTrinoConfig(config)).toThrow(/catalog/iu)
        }
      )
    )
  })

  it("rejects configs missing required fields", () => {
    const requiredFields = ["host", "port", "catalog", "auth"] as const

    for (const field of requiredFields) {
      fc.assert(
        fc.property(arbValidConfig, (config) => {
          const broken = { ...config } as Record<string, unknown>
          // oxlint-disable-next-line typescript/no-dynamic-delete
          delete broken[field]
          expect(() => validateTrinoConfig(broken)).toThrow(Error)
        }),
        { numRuns: 50 }
      )
    }
  })

  it("rejects configs with invalid auth types", () => {
    const invalidAuths = [
      { type: "digest", username: "u", password: "p" },
      { type: "oauth" },
      { type: 42 },
      {},
      "bearer-token-string",
      42,
      null,
      [],
    ]

    fc.assert(
      fc.property(
        arbValidConfig,
        fc.constantFrom(...invalidAuths),
        (base, auth) => {
          const config = { ...base, auth }
          expect(() => validateTrinoConfig(config)).toThrow(Error)
        }
      ),
      { numRuns: 50 }
    )
  })

  it("rejects basic auth with empty credentials", () => {
    fc.assert(
      fc.property(
        arbValidConfig,
        fc.constantFrom(
          { type: "basic", username: "", password: "pass" },
          { type: "basic", username: "user", password: "" },
          { type: "basic", username: "", password: "" }
        ),
        (base, auth) => {
          const config = { ...base, auth }
          expect(() => validateTrinoConfig(config)).toThrow(Error)
        }
      )
    )
  })

  it("rejects bearer auth with empty token", () => {
    fc.assert(
      fc.property(
        arbValidConfig.map((base) => ({
          ...base,
          auth: { type: "bearer", token: "" },
        })),
        (config) => {
          expect(() => validateTrinoConfig(config)).toThrow(Error)
        }
      )
    )
  })

  it("rejects basic auth with surplus fields (e.g. token)", () => {
    fc.assert(
      fc.property(arbValidConfig, arbNonEmptyString, (base, extraValue) => {
        const config = {
          ...base,
          auth: {
            type: "basic",
            username: "user",
            password: "pass",
            token: extraValue,
          },
        }
        expect(() => validateTrinoConfig(config)).toThrow(/unexpected fields/iu)
      }),
      { numRuns: 50 }
    )
  })

  it("rejects bearer auth with surplus fields (e.g. username, password)", () => {
    fc.assert(
      fc.property(
        arbValidConfig,
        arbNonEmptyString,
        arbNonEmptyString,
        (base, extraUser, extraPass) => {
          const config = {
            ...base,
            auth: {
              type: "bearer",
              token: "valid-token",
              username: extraUser,
              password: extraPass,
            },
          }
          expect(() => validateTrinoConfig(config)).toThrow(
            /unexpected fields/iu
          )
        }
      ),
      { numRuns: 50 }
    )
  })

  it("rejects auth with arbitrary surplus keys", () => {
    const surplusKeys = [
      { type: "basic", username: "u", password: "p", extra: "val" },
      { type: "basic", username: "u", password: "p", apiKey: "k" },
      { type: "bearer", token: "t", secret: "s" },
      { type: "bearer", token: "t", refreshToken: "r" },
    ]

    for (const auth of surplusKeys) {
      const config = { host: "h", port: 443, catalog: "c", auth }
      expect(() => validateTrinoConfig(config)).toThrow(/unexpected fields/iu)
    }
  })

  it("rejects invalid optional schema and source values", () => {
    fc.assert(
      fc.property(
        arbValidConfig,
        fc.constantFrom("schema", "source"),
        fc.constantFrom("", 42, false, null, []),
        (base, field, value) => {
          const config = { ...base, [field]: value }
          expect(() => validateTrinoConfig(config)).toThrow(Error)
        }
      ),
      { numRuns: 50 }
    )
  })

  it("rejects invalid timeout values", () => {
    fc.assert(
      fc.property(
        arbValidConfig.chain((base) =>
          arbInvalidTimeout.map((timeout) => ({ ...base, timeout }))
        ),
        (config) => {
          expect(() => validateTrinoConfig(config)).toThrow(/timeout/iu)
        }
      )
    )
  })

  it("rejects non-object retry values", () => {
    fc.assert(
      fc.property(
        arbValidConfig,
        fc.constantFrom(42, "retry", true, false, []),
        (base, retry) => {
          const config = { ...base, retry }
          expect(() => validateTrinoConfig(config)).toThrow(/retry/iu)
        }
      )
    )
  })

  it("error messages never contain password or token values (credential safety)", () => {
    // Use a unique prefix to avoid false positives from trivially short
    // strings (e.g. " ") appearing as natural substrings in error messages.
    const arbSecret = fc
      .string({ minLength: 8, maxLength: 64 })
      .map((s) => `SECRET_${s}_END`)

    fc.assert(
      fc.property(arbSecret, arbSecret, (password, token) => {
        // Basic auth with invalid port — should fail, check message
        const basicConfig = {
          host: "trino.example.com",
          port: -1,
          catalog: "cat",
          auth: { type: "basic", username: "user", password },
        }

        try {
          validateTrinoConfig(basicConfig)
        } catch (error: unknown) {
          const msg = (error as Error).message
          expect(msg).not.toContain(password)
        }

        // Bearer auth with invalid port — should fail, check message
        const bearerConfig = {
          host: "trino.example.com",
          port: -1,
          catalog: "cat",
          auth: { type: "bearer", token },
        }

        try {
          validateTrinoConfig(bearerConfig)
        } catch (error: unknown) {
          const msg = (error as Error).message
          expect(msg).not.toContain(token)
        }
      }),
      { numRuns: 100 }
    )
  })

  it("error messages for auth validation never expose credential values", () => {
    const arbSecret = fc
      .string({ minLength: 8, maxLength: 64 })
      .map((s) => `SECRET_${s}_END`)

    fc.assert(
      fc.property(arbSecret, (secret) => {
        // Basic auth with empty password — the error should not
        // contain the username secret value
        const basicEmptyPw = {
          host: "h",
          port: 443,
          catalog: "c",
          auth: { type: "basic", username: secret, password: "" },
        }
        try {
          validateTrinoConfig(basicEmptyPw)
        } catch (error: unknown) {
          const msg = (error as Error).message
          expect(msg).not.toContain(secret)
        }

        // Bearer auth with empty token — error references the field
        const bearerEmpty = {
          host: "h",
          port: 443,
          catalog: "c",
          auth: { type: "bearer", token: "" },
        }
        try {
          validateTrinoConfig(bearerEmpty)
        } catch (error: unknown) {
          const msg = (error as Error).message
          expect(msg).toContain("auth.token")
        }
      }),
      { numRuns: 50 }
    )
  })

  it("validation errors are plain Error, not DataSourceError", () => {
    fc.assert(
      fc.property(arbNonObject, (input) => {
        try {
          validateTrinoConfig(input)
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error)
          expect(error).not.toBeInstanceOf(DataSourceError)
        }
      })
    )
  })

  it("does not require an inner adapter discriminator", () => {
    fc.assert(
      fc.property(arbValidConfig, (config) => {
        // A valid config without an `adapter` field should pass
        const withoutAdapter = { ...config } as Record<string, unknown>
        // oxlint-disable-next-line typescript/no-dynamic-delete
        delete withoutAdapter.adapter
        expect(() => validateTrinoConfig(withoutAdapter)).not.toThrow()

        // A valid config with an extra `adapter` field should also pass
        // (the validator ignores extra properties)
        const withAdapter = { ...config, adapter: "trino" }
        expect(() => validateTrinoConfig(withAdapter)).not.toThrow()
      }),
      { numRuns: 50 }
    )
  })
})
