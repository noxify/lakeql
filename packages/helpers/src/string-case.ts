import { camelCase, capitalize, upperFirst } from "es-toolkit/compat"

/**
 * Converts a string to `camelCase`, reproducing `lodash`'s `camelCase` output
 * exactly.
 *
 * `es-toolkit`'s strict `camelCase` preserves Unicode and segments words
 * differently from `lodash` — it keeps symbol/currency characters (`"x_€"` →
 * `"x"` vs `lodash`'s `"x€"`) and splits on apostrophes (`"it's"` → `"itS"` vs
 * `lodash`'s `"its"`). `es-toolkit/compat`'s `camelCase` is purpose-built to
 * match `lodash`: it deburrs Latin diacritics and ligatures internally (`"é1"` →
 * `"e1"`, `"ß"` → `"ss"`, `"café-bar"` → `"cafeBar"`) and segments words the
 * same way, so generated names stay byte-for-byte identical across the
 * `lodash` → `es-toolkit` migration. Non-Latin scripts (Hangul, Cyrillic,
 * Greek, emoji) are left intact, exactly as `lodash` did.
 *
 * This is the single casing implementation shared by name derivation, the
 * `namePrefix` validator, and schema generation, so the three can never drift.
 *
 * @param value - The input string in any casing or script.
 * @returns The camel-cased string, identical to `lodash`'s `camelCase`.
 */
export const toCamelCase = (value: string): string => camelCase(value)

/**
 * Upper-cases the first character of a string, reproducing `lodash`'s
 * `upperFirst` output exactly.
 *
 * `es-toolkit/compat`'s `upperFirst` only changes the first character and
 * leaves the rest of the string untouched, so accented and non-Latin input is
 * preserved (`"é1"` → `"É1"`, `"über"` → `"Über"`) exactly as `lodash` did.
 *
 * @param value - The input string in any casing or script.
 * @returns The string with its first character upper-cased.
 */
export const toUpperFirst = (value: string): string => upperFirst(value)

/**
 * Capitalizes a string (first character upper-cased, the rest lower-cased),
 * reproducing `lodash`'s `capitalize` output exactly.
 *
 * `es-toolkit/compat`'s `capitalize` matches `lodash`: only the casing of
 * existing characters changes, so accented and non-Latin input is preserved
 * (`"ÉCOLE"` → `"École"`, `"über"` → `"Über"`).
 *
 * @param value - The input string in any casing or script.
 * @returns The capitalized string, identical to `lodash`'s `capitalize`.
 */
export const toCapitalize = (value: string): string => capitalize(value)
