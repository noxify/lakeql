import kleur from "kleur"

import { SYMBOLS } from "./constants"

export const success = (message: string) => `${SYMBOLS.Tick} ${message}`

export const error = (message: string) => `${SYMBOLS.Cross} ${message}`

export const info = (message: string) => `${SYMBOLS.Pointer} ${message}`

export const warning = (message: string) => `${SYMBOLS.Active} ${message}`

/** A bold section heading for grouping blocks of CLI output. */
export const heading = (message: string) => kleur.bold(message)

/** De-emphasized text for secondary detail (hints, step numbers). */
export const dim = (message: string) => kleur.gray(message)

/** A list item marked with a dim bullet, for enumerated output. */
export const bullet = (message: string) => `${kleur.gray("•")} ${message}`

/**
 * Low-level color atoms for building output. These use colors that stay legible
 * on both light and dark terminals (unlike gray, which washes out on one or the
 * other). Intended for composing richer renderers such as code highlighting.
 */
export const colors = {
  keyword: (s: string) => kleur.magenta(s),
  string: (s: string) => kleur.green(s),
  property: (s: string) => kleur.cyan(s),
  punctuation: (s: string) => kleur.white(s),
  plain: (s: string) => kleur.white(s),
}
