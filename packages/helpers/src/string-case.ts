import { camelCase, capitalize, upperFirst } from "es-toolkit"
import { deburr } from "es-toolkit/compat"

/**
 * Converts a string to `camelCase`, deburring Latin diacritics and ligatures
 * first so the result matches `lodash`'s `camelCase` output.
 *
 * `es-toolkit`'s strict `camelCase` preserves Unicode instead of folding Latin
 * accents (`é`, `ü`, `ö`) and ligatures (`ß`, `æ`) the way `lodash` did. The
 * `deburr` pre-step from `es-toolkit/compat` reproduces that folding, so
 * generated names stay stable across the `lodash` → `es-toolkit` migration
 * (e.g. `"café-bar"` → `"cafeBar"`, `"é1"` → `"e1"`, `"ß"` → `"ss"`). Non-Latin
 * scripts (Hangul, Cyrillic, Greek, emoji) are left intact by both libraries.
 *
 * This is the single casing implementation shared by name derivation, the
 * `namePrefix` validator, and schema generation, so the three can never drift.
 *
 * @param value - The input string in any casing or script.
 * @returns The deburred, camel-cased string.
 */
export const toCamelCase = (value: string): string => camelCase(deburr(value))

/**
 * Upper-cases the first character of a string, deburring Latin diacritics and
 * ligatures first so the result matches `lodash`'s `upperFirst` output.
 *
 * See {@link toCamelCase} for why the `deburr` pre-step is applied.
 *
 * @param value - The input string in any casing or script.
 * @returns The deburred string with its first character upper-cased.
 */
export const toUpperFirst = (value: string): string => upperFirst(deburr(value))

/**
 * Capitalizes a string (first character upper-cased, the rest lower-cased),
 * deburring Latin diacritics and ligatures first so the result matches
 * `lodash`'s `capitalize` output.
 *
 * See {@link toCamelCase} for why the `deburr` pre-step is applied.
 *
 * @param value - The input string in any casing or script.
 * @returns The deburred, capitalized string.
 */
export const toCapitalize = (value: string): string => capitalize(deburr(value))
