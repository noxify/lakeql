import { camelCase, capitalize, upperFirst } from "es-toolkit/compat"

/**
 * Converts a string to `camelCase`, matching `lodash`'s `camelCase` output
 * across the realistic input set this repo feeds it.
 *
 * `es-toolkit`'s strict `camelCase` preserves Unicode and segments words
 * differently from `lodash` — it keeps symbol/currency characters (`"x_€"` →
 * `"x"` vs `lodash`'s `"x€"`) and splits on apostrophes (`"it's"` → `"itS"` vs
 * `lodash`'s `"its"`). `es-toolkit/compat`'s `camelCase` is purpose-built to
 * match `lodash`: it deburrs Latin diacritics and ligatures internally (`"é1"` →
 * `"e1"`, `"ß"` → `"ss"`, `"café-bar"` → `"cafeBar"`) and segments words the
 * same way, so generated names stay identical across the `lodash` →
 * `es-toolkit` migration for every input that reaches this wrapper. Non-Latin
 * scripts (Hangul, Cyrillic, Greek, emoji) are left intact, exactly as `lodash`
 * did. This is not an equality claim for all of Unicode: some exotic inputs
 * (e.g. U+212B, ZWJ sequences, combining marks) still differ between the two
 * libraries, but they are unreachable here because callers sanitize values to
 * ASCII before casing.
 *
 * This is the single casing implementation shared by name derivation, the
 * `namePrefix` validator, and schema generation, so the three can never drift.
 *
 * @param value - The input string in any casing or script.
 * @returns The camel-cased string, matching `lodash`'s `camelCase` on the
 *   reachable (ASCII-after-sanitize) input set.
 */
export const toCamelCase = (value: string): string => camelCase(value)

/**
 * Upper-cases the first character of a string, matching `lodash`'s `upperFirst`
 * output across the realistic input set this repo feeds it.
 *
 * `es-toolkit/compat`'s `upperFirst` only changes the first character and
 * leaves the rest of the string untouched, so accented and non-Latin input is
 * preserved (`"é1"` → `"É1"`, `"über"` → `"Über"`) exactly as `lodash` did.
 * As with {@link toCamelCase}, this is not an all-Unicode equality claim —
 * exotic inputs (U+212B, ZWJ sequences, combining marks) that never reach this
 * wrapper can still differ between the two libraries.
 *
 * @param value - The input string in any casing or script.
 * @returns The string with its first character upper-cased.
 */
export const toUpperFirst = (value: string): string => upperFirst(value)

/**
 * Capitalizes a string (first character upper-cased, the rest lower-cased),
 * matching `lodash`'s `capitalize` output across the realistic input set this
 * repo feeds it.
 *
 * `es-toolkit/compat`'s `capitalize` matches `lodash`: only the casing of
 * existing characters changes, so accented and non-Latin input is preserved
 * (`"ÉCOLE"` → `"École"`, `"über"` → `"Über"`). This is not an all-Unicode
 * equality claim: a known unreachable difference is `capitalize("İ", U+0130)`,
 * which `lodash` renders as `"I\u0307"` and `compat` does not. Such inputs
 * never reach this wrapper because callers sanitize values to ASCII first.
 *
 * @param value - The input string in any casing or script.
 * @returns The capitalized string, matching `lodash`'s `capitalize` on the
 *   reachable (ASCII-after-sanitize) input set.
 */
export const toCapitalize = (value: string): string => capitalize(value)
