import type { InputFieldRef, SchemaTypes } from "@pothos/core"

import type { builder as SchemaBuilder } from "./builder"
import type { BuilderScalar } from "./types"

type AllowedOperators =
  | "is"
  | "isNot"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "notLike"
  | "in"
  | "notIn"

/** The scalar types that receive a generated `FieldComparison` input type. */
type ComparisonScalar = Extract<
  BuilderScalar,
  "String" | "Int" | "Float" | "ID" | "Boolean" | "Date" | "DateTime"
>

/** List-typed operators accept an array of the field's scalar type. */
const LIST_OPERATORS = new Set<AllowedOperators>(["in", "notIn"])

/** Boolean operators accept a plain boolean regardless of the field type. */
const BOOLEAN_OPERATORS = new Set<AllowedOperators>(["is", "isNot"])

/**
 * The allowed comparison operators for each scalar type. The key becomes the
 * generated GraphQL input type name (`${type}FieldComparison`) and the value is
 * the exact, ordered set of operator fields that type exposes.
 */
const COMPARISONS: Record<ComparisonScalar, AllowedOperators[]> = {
  String: ["eq", "neq", "like", "notLike", "in", "notIn"],
  Int: ["eq", "neq", "lt", "lte", "gt", "gte", "in", "notIn"],
  Float: ["eq", "neq", "lt", "lte", "gt", "gte", "in", "notIn"],
  ID: ["eq", "neq", "in", "notIn"],
  Boolean: ["is", "isNot"],
  Date: ["eq", "neq", "lt", "lte", "gt", "gte"],
  DateTime: ["eq", "neq", "lt", "lte", "gt", "gte"],
}

/**
 * Registers one GraphQL input type per entry in {@link COMPARISONS}, each named
 * `${type}FieldComparison` and exposing only that type's allowed operators.
 *
 * @param builder - The Pothos schema builder to register the input types on.
 * @returns A record mapping each scalar type to its generated input type ref.
 */
export const createComparisonTypes = (builder: typeof SchemaBuilder) => {
  const generateComparison = (
    type: ComparisonScalar,
    allowedOperators: AllowedOperators[]
  ) =>
    builder.inputType(`${type}FieldComparison`, {
      fields: (t) => {
        const fields: Record<string, unknown> = {}

        for (const operator of allowedOperators) {
          if (BOOLEAN_OPERATORS.has(operator)) {
            fields[operator] = t.boolean({})
          } else if (LIST_OPERATORS.has(operator)) {
            fields[operator] = t.field({ type: [type] })
          } else {
            fields[operator] = t.field({ type })
          }
        }

        return fields as unknown as Record<
          string,
          InputFieldRef<SchemaTypes, SchemaTypes>
        >
      },
    })

  const comparisonTypes = {} as Record<
    ComparisonScalar,
    ReturnType<typeof generateComparison>
  >

  for (const type of Object.keys(COMPARISONS) as ComparisonScalar[]) {
    comparisonTypes[type] = generateComparison(type, COMPARISONS[type])
  }

  return comparisonTypes
}
