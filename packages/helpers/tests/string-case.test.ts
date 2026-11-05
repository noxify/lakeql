import { describe, expect, it } from "vitest"

import { toCamelCase, toCapitalize, toUpperFirst } from "../src/string-case"

/**
 * Golden / characterization test for the `string-case` wrappers.
 *
 * Every expectation below is the output of the repo's previously installed
 * `lodash-es@4.18.1` (`camelCase` / `upperFirst` / `capitalize`), captured
 * directly from that library before the `es-toolkit` swap. The wrappers source
 * `camelCase` / `upperFirst` / `capitalize` from `es-toolkit/compat`, which is
 * purpose-built to reproduce `lodash`, and these expectations must stay
 * identical after the migration for every input class in this table — there is
 * no name change.
 *
 * How the expectations were produced (so the table is reproducible even though
 * `lodash-es` is now removed): each row's expected values were captured by
 * running the then-installed `lodash-es@4.18.1` directly, i.e. the equivalent
 * of
 *
 * ```js
 * import { camelCase, upperFirst, capitalize } from "lodash-es" // @4.18.1
 * cases.map(([s]) => [s, camelCase(s), upperFirst(s), capitalize(s)])
 * ```
 *
 * To re-capture against a specific `lodash-es` release, install that version in
 * a scratch workspace and run the snippet above over the `cases` inputs below.
 * The `es-toolkit/compat` output is asserted equal to these captured literals.
 *
 * Scope of the equality claim: the inputs below are the reachable/realistic set
 * — in production every value reaching these wrappers is ASCII by the time
 * `sanitizeFieldName` has run, and across that realistic set `es-toolkit/compat`
 * matches `lodash` exactly. This is NOT a claim of equality for all of Unicode:
 * some exotic inputs that never reach the wrappers still differ between the two
 * libraries (e.g. `capitalize("İ", U+0130)` is `"I\u0307"` under `lodash` vs
 * `"i̇"`/`"İ"` under `compat`; U+212B, ZWJ sequences, and combining marks can
 * also diverge). Those are documented as unreachable, not asserted here.
 *
 * The input set is the representative set the migration brief required: Latin
 * diacritics, Latin ligatures, mixed separators, digit-leading / digit-bearing
 * tokens, non-Latin scripts (Hangul, Cyrillic, Greek, emoji), symbol/currency
 * characters, and apostrophes/quotes (the two classes where strict
 * `es-toolkit` `camelCase` provably diverges from `lodash` — `"x_€"` and
 * `"it's"` — and the reason the wrappers use `compat`).
 */
describe("string-case wrappers (golden characterization vs lodash-es@4.18.1)", () => {
  // [input, lodash camelCase, lodash upperFirst, lodash capitalize]
  const cases: [string, string, string, string][] = [
    // Latin diacritics
    ["é1", "e1", "É1", "É1"],
    ["café-bar", "cafeBar", "Café-bar", "Café-bar"],
    ["über", "uber", "Über", "Über"],
    ["ömega", "omega", "Ömega", "Ömega"],
    ["naïve", "naive", "Naïve", "Naïve"],
    ["São_Paulo", "saoPaulo", "São_Paulo", "São_paulo"],
    // Latin ligatures
    ["ß", "ss", "SS", "SS"],
    ["æther", "aether", "Æther", "Æther"],
    ["Æthelred", "aethelred", "Æthelred", "Æthelred"],
    ["œuvre", "oeuvre", "Œuvre", "Œuvre"],
    ["straße", "strasse", "Straße", "Straße"],
    // Mixed separators
    ["foo-bar", "fooBar", "Foo-bar", "Foo-bar"],
    ["foo_bar", "fooBar", "Foo_bar", "Foo_bar"],
    ["foo bar", "fooBar", "Foo bar", "Foo bar"],
    ["CONSTANT_CASE", "constantCase", "CONSTANT_CASE", "Constant_case"],
    ["PascalCase", "pascalCase", "PascalCase", "Pascalcase"],
    ["fooBar", "fooBar", "FooBar", "Foobar"],
    ["--foo--bar--", "fooBar", "--foo--bar--", "--foo--bar--"],
    ["foo.bar", "fooBar", "Foo.bar", "Foo.bar"],
    [
      "multiple   spaces",
      "multipleSpaces",
      "Multiple   spaces",
      "Multiple   spaces",
    ],
    // Digit-leading / digit-containing
    ["1x", "1X", "1x", "1x"],
    ["123", "123", "123", "123"],
    ["x1", "x1", "X1", "X1"],
    ["field2name", "field2Name", "Field2name", "Field2name"],
    ["2fast2furious", "2Fast2Furious", "2fast2furious", "2fast2furious"],
    ["v2_api", "v2Api", "V2_api", "V2_api"],
    // Non-Latin scripts — not deburred by lodash, identical on both libraries
    ["한글-테스트", "한글테스트", "한글-테스트", "한글-테스트"],
    ["привет_мир", "приветМир", "Привет_мир", "Привет_мир"],
    ["Ωμέγα", "ωμέγα", "Ωμέγα", "Ωμέγα"],
    ["Ωmega", "ωmega", "Ωmega", "Ωmega"],
    ["keep unicode 😅", "keepUnicode😅", "Keep unicode 😅", "Keep unicode 😅"],
    ["emoji😅test", "emoji😅Test", "Emoji😅test", "Emoji😅test"],
    ["a日", "a日", "A日", "A日"],
    // Symbol / currency — lodash keeps symbol word-chars; compat matches lodash
    ["x_€", "x€", "X_€", "X_€"],
    ["price€", "price€", "Price€", "Price€"],
    // Apostrophes / quotes — lodash treats them as word-internal (no split);
    // compat matches lodash (strict es-toolkit would split: "it's" -> "itS")
    ["it's", "its", "It's", "It's"],
    ["a'b", "ab", "A'b", "A'b"],
    ["foo’s", "foos", "Foo’s", "Foo’s"],
    ["don't", "dont", "Don't", "Don't"],
    ["rock'n'roll", "rocknroll", "Rock'n'roll", "Rock'n'roll"],
    ["O'Brien", "oBrien", "O'Brien", "O'brien"],
    ["l'été", "lete", "L'été", "L'été"],
  ]

  it.each(cases)(
    "%j → camelCase %j, upperFirst %j, capitalize %j",
    (input, camel, upper, cap) => {
      expect(toCamelCase(input)).toBe(camel)
      expect(toUpperFirst(input)).toBe(upper)
      expect(toCapitalize(input)).toBe(cap)
    }
  )

  it("reproduces the reference cases from the migration notes", () => {
    expect(toCamelCase("é1")).toBe("e1")
    expect(toCamelCase("ß")).toBe("ss")
    expect(toCamelCase("café-bar")).toBe("cafeBar")
    expect(toCamelCase("한글-테스트")).toBe("한글테스트")
    expect(toCamelCase("keep unicode 😅")).toBe("keepUnicode😅")
  })

  it("is pure — repeated calls return identical results", () => {
    expect(toCamelCase("foo-bar")).toBe(toCamelCase("foo-bar"))
    expect(toUpperFirst("foo-bar")).toBe(toUpperFirst("foo-bar"))
    expect(toCapitalize("foo-bar")).toBe(toCapitalize("foo-bar"))
  })
})
