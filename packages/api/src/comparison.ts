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

// Merge core types with our custom scalars
export const createComparisonTypes = (builder: typeof SchemaBuilder) => {
  const generateComparison = ({
    name,
    type,
    allowedOperators,
  }: {
    name?: string
    type: BuilderScalar
    allowedOperators?: AllowedOperators[]
  }) =>
    builder.inputType(`${name ?? type}FieldComparison`, {
      fields: (t) => {
        const operators = {
          eq: t.field({ type }),
          gt: t.field({ type }),
          gte: t.field({ type }),
          in: t.field({ type: [type] }),
          is: t.boolean({}),
          isNot: t.boolean({}),
          like: t.field({ type }),
          lt: t.field({ type }),
          lte: t.field({ type }),
          neq: t.field({ type }),
          notIn: t.field({ type: [type] }),
          notLike: t.field({ type }),
        } as unknown as Record<string, InputFieldRef<SchemaTypes, SchemaTypes>>

        const operatorKeys =
          allowedOperators ?? (Object.keys(operators) as AllowedOperators[])

        const availableOperators: Record<
          AllowedOperators,
          InputFieldRef<SchemaTypes, SchemaTypes>
        > = {} as Record<
          AllowedOperators,
          InputFieldRef<SchemaTypes, SchemaTypes>
        >

        for (const operatorKey of operatorKeys) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          availableOperators[operatorKey] = operators[operatorKey]!
        }

        return availableOperators
      },
    })

  const createStringFieldComparison = ({ name }: { name?: string }) =>
    generateComparison({
      allowedOperators: ["eq", "neq", "like", "notLike", "in", "notIn"],
      name,
      type: "String",
    })

  const createIntFieldComparison = ({ name }: { name?: string }) =>
    generateComparison({
      allowedOperators: ["eq", "neq", "lt", "lte", "gt", "gte", "in", "notIn"],
      name,
      type: "Int",
    })

  const createFloatFieldComparison = ({ name }: { name?: string }) =>
    generateComparison({
      allowedOperators: ["eq", "neq", "lt", "lte", "gt", "gte", "in", "notIn"],
      name,
      type: "Float",
    })

  const createIDFieldComparison = ({ name }: { name?: string }) =>
    generateComparison({
      allowedOperators: ["eq", "neq", "in", "notIn"],
      name,
      type: "ID",
    })

  const createBooleanFieldComparison = ({ name }: { name?: string }) =>
    generateComparison({
      allowedOperators: ["is", "isNot"],
      name,
      type: "Boolean",
    })

  const createDateFieldComparison = ({ name }: { name?: string }) =>
    generateComparison({
      allowedOperators: ["eq", "neq", "lt", "lte", "gt", "gte"],
      name,
      type: "Date",
    })

  const createDateTimeFieldComparison = ({ name }: { name?: string }) =>
    generateComparison({
      allowedOperators: ["eq", "neq", "lt", "lte", "gt", "gte"],
      name,
      type: "DateTime",
    })

  return {
    createBooleanFieldComparison,
    createDateFieldComparison,
    createDateTimeFieldComparison,
    createFloatFieldComparison,
    createIDFieldComparison,
    createIntFieldComparison,
    createStringFieldComparison,
  }
}
