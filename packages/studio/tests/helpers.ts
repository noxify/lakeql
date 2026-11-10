import { expect } from "vitest"

/**
 * Asserts a value is defined and returns it narrowed, so tests can drill into
 * nested structures without non-null assertions.
 *
 * @template T - The value's type when present.
 * @param value - The possibly-undefined value.
 * @returns The value, asserted non-nullish.
 */
export function defined<T>(value: T | undefined | null): T {
  expect(value).toBeDefined()
  return value as T
}

/**
 * Asserts a discriminated result is its `ok: true` variant and returns it
 * narrowed, so follow-up assertions are not written inside an `if` (which the
 * lint rules forbid as a conditional expect).
 *
 * @template T - The success-variant payload.
 * @param result - A discriminated `{ ok: true } & T | { ok: false, ... }`.
 * @returns The success variant, narrowed.
 */
export function expectOk<T extends { ok: boolean }>(
  result: T
): Extract<T, { ok: true }> {
  expect(result.ok).toBeTruthy()
  return result as Extract<T, { ok: true }>
}

/**
 * Asserts a discriminated result is its `ok: false` variant and returns it
 * narrowed.
 *
 * @template T - The result union.
 * @param result - A discriminated `{ ok: false, errors } | { ok: true, ... }`.
 * @returns The failure variant, narrowed.
 */
export function expectErr<T extends { ok: boolean }>(
  result: T
): Extract<T, { ok: false }> {
  expect(result.ok).toBeFalsy()
  return result as Extract<T, { ok: false }>
}
