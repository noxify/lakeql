import { describe, expect, it } from "vitest"

import { toCamelCase, toCapitalize, toUpperFirst } from "../src/string-case"

/**
 * Golden / characterization test for the `string-case` wrappers.
 *
 * These expectations were pinned against the repo's previously installed
 * `lodash-es@4.18.1` and must stay identical after the `es-toolkit` migration
 * for every NON-symbol input class. The wrappers are `deburr` (es-toolkit/compat)
 * followed by strict `es-toolkit` `camelCase` / `upperFirst` / `capitalize`.
 *
 * `toCamelCase` matches lodash's `camelCase` on every pinned case EXCEPT
 * symbol/currency characters (`€`, `¥`, `£`, `§`): lodash kept them as word
 * characters (e.g. `"x_€"` → `"x€"`), producing a value that was never a valid
 * GraphQL name; strict `camelCase` drops them (`"x_€"` → `"x"`). This single,
 * documented divergence is intentional — see the migration changelog.
 *
 * `toUpperFirst` / `toCapitalize` deburr Latin diacritics and ligatures before
 * casing (unlike lodash's `upperFirst` / `capitalize`, which only change the
 * first character). At every real call site these wrappers are applied to an
 * already-`toCamelCase`d, deburred value, so the folding below never changes a
 * generated name — it only guarantees the wrappers are self-consistent.
 */
describe("string-case wrappers (golden characterization)", () => {
  // [input, toCamelCase, toUpperFirst, toCapitalize]
  const cases: [string, string, string, string][] = [
    // Latin diacritics — folded by deburr, matches lodash camelCase
    ["é1", "e1", "E1", "E1"],
    ["café-bar", "cafeBar", "Cafe-bar", "Cafe-bar"],
    ["über", "uber", "Uber", "Uber"],
    ["ömega", "omega", "Omega", "Omega"],
    ["naïve", "naive", "Naive", "Naive"],
    ["São_Paulo", "saoPaulo", "Sao_Paulo", "Sao_paulo"],
    // Latin ligatures — folded by deburr, matches lodash camelCase
    ["ß", "ss", "Ss", "Ss"],
    ["æther", "aether", "Aether", "Aether"],
    ["Æthelred", "aethelred", "Aethelred", "Aethelred"],
    ["œuvre", "oeuvre", "Oeuvre", "Oeuvre"],
    ["straße", "strasse", "Strasse", "Strasse"],
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
    // Non-Latin scripts — NOT deburred by lodash or es-toolkit, identical on both
    ["한글-테스트", "한글테스트", "한글-테스트", "한글-테스트"],
    ["привет_мир", "приветМир", "Привет_мир", "Привет_мир"],
    ["Ωμέγα", "ωμέγα", "Ωμέγα", "Ωμέγα"],
    ["Ωmega", "ωmega", "Ωmega", "Ωmega"],
    ["keep unicode 😅", "keepUnicode😅", "Keep unicode 😅", "Keep unicode 😅"],
    ["emoji😅test", "emoji😅Test", "Emoji😅test", "Emoji😅test"],
    ["a日", "a日", "A日", "A日"],
    // Symbol / currency — the one DOCUMENTED divergence from lodash:
    // lodash camelCase("x_€") === "x€" (kept the symbol); strict drops it to "x".
    ["x_€", "x", "X_€", "X_€"],
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
