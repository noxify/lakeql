/**
 * TypeScript value serializer that supports code expressions via `expr()`.
 * Used to generate lakeql.config.ts with references like `env.TRINO_HOST`
 * without wrapping them in quotes.
 */

export interface TsExpr {
  __type: "expr"
  code: string
}

export function expr(code: string): TsExpr {
  return { __type: "expr", code }
}

type Primitive = string | number | boolean | null | TsExpr
export type TsValue = Primitive | TsValue[] | { [k: string]: TsValue }

function isExpr(value: unknown): value is TsExpr {
  return (
    value !== null &&
    typeof value === "object" &&
    "__type" in value &&
    (value as TsExpr).__type === "expr"
  )
}

function isValidIdentifier(key: string): boolean {
  return /^[A-Za-z_$][\w$]*$/u.test(key)
}

function printKey(key: string): string {
  return isValidIdentifier(key) ? key : JSON.stringify(key)
}

/**
 * Sort object entries with 'adapter' first, then alphabetically.
 */
function sortEntries(entries: [string, TsValue][]): [string, TsValue][] {
  return entries.toSorted(([a], [b]) => {
    if (a === "adapter") {
      return -1
    }
    if (b === "adapter") {
      return 1
    }
    return a.localeCompare(b)
  })
}

/**
 * Serialize a TsValue into a TypeScript source string.
 * - Primitives become their literal representation
 * - TsExpr values are emitted as raw code (no quotes)
 * - Objects/arrays are indented recursively
 */
export function serializeTs(
  value: TsValue,
  indent = 0,
  indentStr = "  "
): string {
  const pad = (n: number) => indentStr.repeat(n)

  if (isExpr(value)) {
    return value.code
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value)
  }

  if (typeof value === "string") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]"
    }
    const items = value.map((v) => serializeTs(v, indent + 1, indentStr))
    return `[\n${items.map((s) => `${pad(indent + 1)}${s},`).join("\n")}\n${pad(indent)}]`
  }

  const entries = sortEntries(Object.entries(value))
  if (entries.length === 0) {
    return "{}"
  }

  const body = entries
    .map(
      ([k, v]) =>
        `${pad(indent + 1)}${printKey(k)}: ${serializeTs(v, indent + 1, indentStr)},`
    )
    .join("\n")

  return `{\n${body}\n${pad(indent)}}`
}
