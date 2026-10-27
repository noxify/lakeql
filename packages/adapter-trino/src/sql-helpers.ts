/**
 * Adapter-owned Trino SQL rendering helpers for identifier quoting and
 * literal escaping. These are used by metadata queries, DDL rendering,
 * and the Trino dialect throughout the adapter.
 *
 * @module
 */

import { quoteQualified, rejectControlChars } from "@lakeql/datasource"

export { escapeLiteral, isPlainObject } from "@lakeql/datasource"

/**
 * Quote a single SQL identifier segment for Trino.
 *
 * The input is treated as exactly one identifier segment. Dots within the
 * value are preserved as part of the segment and are **not** interpreted as
 * qualification separators. Embedded double-quote characters are escaped by
 * doubling them (`"` → `""`), and the result is wrapped in double quotes.
 *
 * @param segment - The raw identifier segment to quote.
 * @returns The safely double-quoted identifier string.
 * @throws {Error} If `segment` is empty or contains C0/C1 control characters.
 *
 * @example
 * ```ts
 * quoteIdentifier("my_table")       // => '"my_table"'
 * quoteIdentifier('has"quote')      // => '"has""quote"'
 * quoteIdentifier("catalog.with.dot") // => '"catalog.with.dot"'
 * ```
 */
export function quoteIdentifier(segment: string): string {
  if (segment.length === 0) {
    throw new Error("Identifier segment must not be empty")
  }

  rejectControlChars(segment, "Identifier segment")

  return `"${segment.replaceAll('"', '""')}"`
}

/**
 * Quote a fully-qualified Trino identifier composed of one or more segments.
 *
 * Applies {@link quoteIdentifier} independently to each segment and joins
 * them with literal dots. Requires at least one segment.
 *
 * @param segments - One or more raw identifier segments (e.g. catalog, schema, table).
 * @returns The safely quoted qualified identifier string.
 * @throws {Error} If no segments are provided, or if any segment is invalid.
 *
 * @example
 * ```ts
 * quoteQualifiedIdentifier("iceberg", "public", "orders")
 * // => '"iceberg"."public"."orders"'
 * ```
 */
export function quoteQualifiedIdentifier(...segments: string[]): string {
  return quoteQualified(quoteIdentifier, ...segments)
}

/**
 * Escape LIKE wildcard characters (`%` and `_`) in a literal string value
 * by prefixing each with a backslash. The resulting pattern is intended for
 * use with Trino's `ESCAPE '\'` clause.
 *
 * This is used by `startsWith`, `notStartsWith`, `endsWith`, and
 * `notEndsWith` filter operators where the user value is a literal
 * prefix/suffix — not a LIKE pattern.
 *
 * @param value - The raw string to escape.
 * @returns The string with `%` and `_` escaped.
 */
export function escapeLikeWildcards(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
}

/**
 * Unparameterized scalar types accepted by the Trino DDL whitelist.
 *
 * Multi-word types like `TIME WITH TIME ZONE` are stored as single entries
 * with words joined by spaces. Lookup is performed against the uppercased,
 * whitespace-normalised input.
 */
const UNPARAMETERIZED_TYPES = new Set([
  "BOOLEAN",
  "TINYINT",
  "SMALLINT",
  "INTEGER",
  "BIGINT",
  "REAL",
  "DOUBLE",
  "DATE",
  "TIME",
  "TIME WITH TIME ZONE",
  "TIMESTAMP",
  "TIMESTAMP WITH TIME ZONE",
  "VARBINARY",
])

/**
 * Parameterized type names that require parenthesised integer arguments.
 * The value is the argument-count expectation and bound-validation callback.
 */
const PARAMETERIZED_TYPES: Record<
  string,
  {
    argCount: number
    validate: (args: number[], canonical: string) => void
  }
> = {
  DECIMAL: {
    argCount: 2,
    validate([precision, scale]) {
      if (!isValidInt(precision) || precision < 1 || precision > 38) {
        throw new Error("DECIMAL precision must be an integer from 1 to 38")
      }
      if (!isValidInt(scale) || scale < 0 || scale > precision) {
        throw new Error("DECIMAL scale must be an integer from 0 to precision")
      }
    },
  },
  CHAR: {
    argCount: 1,
    validate([length]) {
      if (!isValidInt(length) || length < 1 || length > 255) {
        throw new Error("CHAR length must be an integer from 1 to 255")
      }
    },
  },
  VARCHAR: {
    argCount: 1,
    validate([length]) {
      if (!isValidInt(length) || length < 1 || length > 65_535) {
        throw new Error("VARCHAR length must be an integer from 1 to 65535")
      }
    },
  },
}

/** Returns `true` if `n` is a finite integer. */
function isValidInt(n: number | undefined): n is number {
  return n !== undefined && Number.isFinite(n) && Number.isInteger(n)
}

/**
 * Reject input containing SQL comment markers or semicolons.
 */
function rejectDangerousPatterns(input: string): void {
  if (input.includes(";")) {
    throw new Error("Column type must not contain semicolons")
  }
  // oxlint-disable-next-line no-abusive-eslint-disable
  if (input.includes("--")) {
    throw new Error("Column type must not contain SQL comment markers")
  }
  if (input.includes("/*")) {
    throw new Error("Column type must not contain SQL comment markers")
  }
}

/**
 * Parse and validate a Trino column type string against the scalar type
 * whitelist.
 *
 * Accepted types are:
 * - **Unparameterized:** `BOOLEAN`, `TINYINT`, `SMALLINT`, `INTEGER`,
 *   `BIGINT`, `REAL`, `DOUBLE`, `DATE`, `TIME`, `TIME WITH TIME ZONE`,
 *   `TIMESTAMP`, `TIMESTAMP WITH TIME ZONE`, `VARBINARY`
 * - **Parameterized:** `DECIMAL(p,s)`, `CHAR(n)`, `VARCHAR(n)`
 *
 * Matching is case-insensitive. Optional whitespace around parentheses and
 * commas in parameterized types is tolerated. The returned canonical string
 * is always uppercase with no extra whitespace and integer parameters
 * (e.g. `decimal( 10 , 2 )` → `DECIMAL(10,2)`).
 *
 * The parser is idempotent: parsing canonical output produces the same
 * canonical output.
 *
 * @param type - The raw column type string to parse.
 * @returns The canonical uppercase type string.
 * @throws {Error} If the type is not in the scalar whitelist, has malformed
 *   parameters, contains control characters, semicolons, or SQL comment
 *   markers.
 *
 * @example
 * ```ts
 * parseTrinoColumnType("varchar(255)")     // => "VARCHAR(255)"
 * parseTrinoColumnType("decimal( 10 , 2 )") // => "DECIMAL(10,2)"
 * parseTrinoColumnType("  boolean  ")       // => "BOOLEAN"
 * parseTrinoColumnType("timestamp with time zone") // => "TIMESTAMP WITH TIME ZONE"
 * ```
 */
export function parseTrinoColumnType(type: string): string {
  rejectControlChars(type, "Column type")
  rejectDangerousPatterns(type)

  const trimmed = type.trim()
  if (trimmed.length === 0) {
    throw new Error("Column type must not be empty")
  }

  // Tokenise: split into word tokens, a `(` token, a `)` token, a `,`
  // token, and integer-literal tokens. Whitespace is consumed between
  // tokens but is not itself a token.
  const tokens = tokenise(trimmed)

  if (tokens.length === 0) {
    throw new Error(`Unsupported column type: "${type}"`)
  }

  // Consume leading word tokens to build the type name. Multi-word
  // types like TIME WITH TIME ZONE are matched greedily.
  const { typeName, rest } = consumeTypeName(tokens)
  const upperName = typeName.toUpperCase()

  if (UNPARAMETERIZED_TYPES.has(upperName)) {
    if (rest.length > 0) {
      throw new Error(
        `${upperName} does not accept parameters, but got trailing tokens`
      )
    }
    return upperName
  }

  const paramSpec = PARAMETERIZED_TYPES[upperName]
  if (!paramSpec) {
    throw new Error(`Unsupported column type: "${type}"`)
  }

  const args = consumeParameters(rest, upperName, paramSpec.argCount, type)
  paramSpec.validate(args, upperName)

  return `${upperName}(${args.join(",")})`
}

/**
 * Characters allowed in a (possibly composite) Trino column type rendered into
 * DDL: ASCII letters, digits, underscore, spaces, parentheses and commas. This
 * covers scalar types (`VARCHAR`, `DECIMAL(10,2)`), multi-word types
 * (`TIMESTAMP WITH TIME ZONE`) and composites (`ARRAY(VARCHAR)`,
 * `ROW(id BIGINT, label VARCHAR)`), but excludes quotes, `=`, `'`, `;` and
 * every other character an injection would need to break out of the type
 * position.
 */
const SAFE_COLUMN_TYPE_RE = /^[A-Za-z0-9_ (),]+$/u

/**
 * Validates a column type string before it is interpolated into DDL, allowing
 * composite types that {@link parseTrinoColumnType} (scalar-only) rejects.
 *
 * Unlike `parseTrinoColumnType`, this does not canonicalize or whitelist type
 * names — it is a trust-boundary guard for the DDL sites that accept the
 * open-ended output of a JSON-Schema-to-SQL mapper (`ARRAY`, `ROW`, …). It
 * rejects control characters, SQL comment markers, semicolons, any character
 * outside {@link SAFE_COLUMN_TYPE_RE}, and unbalanced parentheses.
 *
 * @param type - The raw column type string.
 * @returns The trimmed type string, unchanged, when it is safe.
 * @throws {Error} When the type is empty or contains disallowed characters or
 *   unbalanced parentheses.
 */
export function sanitizeColumnType(type: string): string {
  rejectControlChars(type, "Column type")
  rejectDangerousPatterns(type)

  const trimmed = type.trim()
  if (trimmed.length === 0) {
    throw new Error("Column type must not be empty")
  }

  if (!SAFE_COLUMN_TYPE_RE.test(trimmed)) {
    throw new Error(`Unsupported characters in column type: "${type}"`)
  }

  let depth = 0
  for (const ch of trimmed) {
    if (ch === "(") {
      depth += 1
    } else if (ch === ")") {
      depth -= 1
      if (depth < 0) {
        throw new Error(`Unbalanced parentheses in column type: "${type}"`)
      }
    }
  }
  if (depth !== 0) {
    throw new Error(`Unbalanced parentheses in column type: "${type}"`)
  }

  return trimmed
}

type Token =
  | { kind: "word"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" }
  | { kind: "number"; value: number; raw: string }

/** Test whether `ch` is an ASCII letter or underscore. */
function isWordChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  )
}

/** Test whether `ch` is an ASCII digit. */
function isDigitChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return code >= 48 && code <= 57 // 0-9
}

/** Tokenise `input` into structured tokens. Unknown characters cause a throw. */
function tokenise(input: string): Token[] {
  const tokens: Token[] = []
  let pos = 0

  while (pos < input.length) {
    const ch = input[pos] ?? ""

    if (ch === " " || ch === "\t") {
      pos += 1
      continue
    }

    if (ch === "(") {
      tokens.push({ kind: "lparen" })
      pos += 1
      continue
    }

    if (ch === ")") {
      tokens.push({ kind: "rparen" })
      pos += 1
      continue
    }

    if (ch === ",") {
      tokens.push({ kind: "comma" })
      pos += 1
      continue
    }

    if (isWordChar(ch)) {
      const start = pos
      while (pos < input.length && isWordChar(input[pos] ?? "")) {
        pos += 1
      }
      tokens.push({ kind: "word", value: input.slice(start, pos) })
      continue
    }

    if (isDigitChar(ch)) {
      const start = pos
      while (pos < input.length && isDigitChar(input[pos] ?? "")) {
        pos += 1
      }
      const raw = input.slice(start, pos)
      tokens.push({
        kind: "number",
        value: Math.trunc(Number(raw)),
        raw,
      })
      continue
    }

    throw new Error(`Unexpected character '${ch}' in column type: "${input}"`)
  }

  return tokens
}

/**
 * Consume word tokens greedily to form the longest matching type name.
 * Returns the matched type name and remaining tokens.
 */
function consumeTypeName(tokens: Token[]): {
  typeName: string
  rest: Token[]
} {
  const words: string[] = []
  let idx = 0

  while (idx < tokens.length) {
    const tok = tokens[idx]
    if (!tok || tok.kind !== "word") {
      break
    }
    words.push(tok.value)
    idx += 1
  }

  if (words.length === 0) {
    throw new Error("Expected type name but found none")
  }

  // Greedily match the longest known type name from the collected words.
  for (let len = words.length; len >= 1; len -= 1) {
    const candidate = words.slice(0, len).join(" ").toUpperCase()
    if (
      UNPARAMETERIZED_TYPES.has(candidate) ||
      candidate in PARAMETERIZED_TYPES
    ) {
      return {
        typeName: candidate,
        rest: tokens.slice(len),
      }
    }
  }

  // No known type matched — return all words as the candidate so the
  // caller can produce the "unsupported" error.
  return {
    typeName: words.join(" "),
    rest: tokens.slice(words.length),
  }
}

/**
 * Consume parenthesised integer parameters from the remaining tokens.
 * Expects exactly `( int [, int]... )` with `expectedCount` integers.
 */
function consumeParameters(
  tokens: Token[],
  typeName: string,
  expectedCount: number,
  originalInput: string
): number[] {
  let idx = 0

  const first = tokens[idx]
  if (!first || first.kind !== "lparen") {
    throw new Error(`${typeName} requires parameters: "${originalInput}"`)
  }
  idx += 1

  const args: number[] = []

  for (let i = 0; i < expectedCount; i += 1) {
    if (i > 0) {
      const commaTok = tokens[idx]
      if (!commaTok || commaTok.kind !== "comma") {
        throw new Error(
          `${typeName} requires ${expectedCount} parameter(s), but got ${i}: "${originalInput}"`
        )
      }
      idx += 1
    }

    const tok = tokens[idx]
    if (!tok) {
      throw new Error(
        `${typeName} requires ${expectedCount} parameter(s), but got ${i}: "${originalInput}"`
      )
    }
    if (tok.kind !== "number") {
      throw new Error(
        `${typeName} parameter must be an integer, got "${tok.kind === "word" ? tok.value : tok.kind}": "${originalInput}"`
      )
    }
    args.push(tok.value)
    idx += 1
  }

  const closeTok = tokens[idx]
  if (!closeTok || closeTok.kind !== "rparen") {
    throw new Error(`Expected closing ')' for ${typeName}: "${originalInput}"`)
  }
  idx += 1

  if (idx < tokens.length) {
    throw new Error(
      `Unexpected trailing content after ${typeName} parameters: "${originalInput}"`
    )
  }

  return args
}
