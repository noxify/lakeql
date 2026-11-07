import { colors } from "@lakeql/logger/console"

/**
 * Terminal output helpers for command result rendering: lightweight TypeScript
 * snippet highlighting and width-aware prose wrapping.
 *
 * The highlighter is intentionally small — it colors the few token kinds that
 * appear in scaffolding guidance (keywords, strings, property names) rather
 * than parsing TypeScript. It exists to keep pasted code legible on both light
 * and dark terminals, where a single gray would wash out.
 */

/** TypeScript keywords worth coloring in the short snippets we print. */
const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "const",
  "let",
  "default",
  "as",
  "return",
  "type",
])

/**
 * Tokenize a single line into highlight spans. Order matters: strings and
 * comments are matched before identifiers so their contents are not re-colored.
 */
const TOKEN_PATTERN =
  /(?<str>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(?<comment>\/\/.*$)|(?<ident>[A-Za-z_$][\w$]*)|(?<num>\d[\d._]*)|(?<other>[^\w\s"'`]+|\s+)/gu

/** A property name is an identifier immediately followed by a colon. */
function isPropertyName(line: string, endIndex: number): boolean {
  return line[endIndex] === ":"
}

/** Color a single identifier by role (keyword, property name, or plain). */
function colorIdentifier(ident: string, isProperty: boolean): string {
  if (KEYWORDS.has(ident)) {
    return colors.keyword(ident)
  }
  if (isProperty) {
    return colors.property(ident)
  }
  return colors.plain(ident)
}

/**
 * Highlight a single line of TypeScript-ish code with terminal colors.
 *
 * @param line - One line of code (no trailing newline).
 * @returns The line with ANSI color codes applied.
 */
export function highlightTsLine(line: string): string {
  let out = ""

  for (const match of line.matchAll(TOKEN_PATTERN)) {
    const g = match.groups ?? {}
    const { str, comment, ident, num } = g

    if (ident !== undefined) {
      const isProperty = isPropertyName(line, match.index + ident.length)
      out += colorIdentifier(ident, isProperty)
    } else if (
      str !== undefined ||
      comment !== undefined ||
      num !== undefined
    ) {
      out += colors.string(str ?? comment ?? num ?? "")
    } else {
      out += colors.punctuation(match[0])
    }
  }

  return out
}

/** Default width used when the terminal width cannot be determined. */
const FALLBACK_WIDTH = 80

/** Current terminal width, clamped to a sane range for wrapping prose. */
function terminalWidth(): number {
  // oxlint-disable-next-line no-restricted-properties
  const cols = process.stdout.columns
  if (cols && cols >= 20) {
    return Math.min(cols, 100)
  }
  return FALLBACK_WIDTH
}

/**
 * Word-wrap prose to the terminal width, indenting continuation lines so they
 * align under the first line's text rather than the list marker.
 *
 * @param text - The prose to wrap (single logical line, no embedded newlines).
 * @param firstPrefixWidth - Visible width of the first line's prefix (e.g. the
 *   step number), used to align wrapped continuation lines beneath the text.
 * @returns The wrapped lines, the first without indentation (the caller adds
 *   the prefix) and the rest indented by `firstPrefixWidth` spaces.
 */
export function wrapText(text: string, firstPrefixWidth: number): string[] {
  const width = terminalWidth()
  const available = Math.max(width - firstPrefixWidth, 20)
  const words = text.split(/\s+/u)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    if (current.length === 0) {
      current = word
    } else if (current.length + 1 + word.length <= available) {
      current += ` ${word}`
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current.length > 0) {
    lines.push(current)
  }

  const indent = " ".repeat(firstPrefixWidth)
  return lines.map((line, i) => (i === 0 ? line : `${indent}${line}`))
}
