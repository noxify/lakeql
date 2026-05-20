/**
 * Source: https://github.com/TopCli/prompts/blob/main/src/utils.ts
 * License: ISC - https://github.com/TopCli/prompts/blob/main/LICENSE
 * Copyright: 2023-2024 Pierre Demailly
 */

import kleur from "kleur"

import { isUnicodeSupported } from "./utils"

const kMainSymbols = {
  active: "●",
  cross: "✖",
  inactive: "○",
  next: "⭣",
  pointer: "›",
  previous: "⭡",
  tick: "✔",
}
const kFallbackSymbols = {
  active: "(+)",
  cross: "×",
  inactive: "(-)",
  next: "↓",
  pointer: ">",
  previous: "↑",
  tick: "√",
}
const kSymbols =
  // eslint-disable-next-line no-restricted-properties
  isUnicodeSupported() || process.env.CI ? kMainSymbols : kFallbackSymbols
const kPointer = kleur.gray(kSymbols.pointer)

export const SYMBOLS = {
  Active: kleur.cyan(kSymbols.active),
  Cross: kleur.red().bold(kSymbols.cross),
  HideCursor: "\u001B[?25l",
  Inactive: kleur.gray(kSymbols.inactive),
  Next: kSymbols.next,
  Pointer: kPointer,
  Previous: kSymbols.previous,
  QuestionMark: kleur.blue().bold("?"),
  ShowCursor: "\u001B[?25h",
  Tick: kleur.green().bold(kSymbols.tick),
}
