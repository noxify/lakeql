import { format } from "@formkit/tempo"

import type { JSONSchema7 } from "./types"

export interface TransformInput {
  data: Record<string, unknown>
  definition: JSONSchema7
  transformFields?: Record<string, string>
  dateFields?: string[]
  utcDates?: string[]
}

export interface TransformArrayInput {
  data: Record<string, unknown>[]
  definition: JSONSchema7
  transformFields?: Record<string, string>
  dateFields?: string[]
}

export const transform = ({
  data,
  definition,
  transformFields,
  dateFields = [],
  utcDates = [],
}: TransformInput) => {
  const res: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    const fieldName = transformFields?.[key] ?? key
    // get the current field definition from the schema
    const fieldDefinition = definition.properties?.[key] as
      | JSONSchema7
      | undefined

    // ignore unknown properties - this cases
    // exists only in case we use the file upload mutation
    if (!fieldDefinition) {
      continue
    }

    // for simple types like string, number, etc. we don't have
    // to run a transformation, just return the given value
    if (fieldDefinition.type !== "object" && fieldDefinition.type !== "array") {
      if (dateFields.includes(key)) {
        const timestamp = value && (value as number) * 1000

        if (utcDates.includes(key)) {
          const formatted = format({
            date: new Date(timestamp as number),
            format: "YYYY-MM-DDTHH:mm:ss",
            tz: "Europe/Berlin",
          })
          res[fieldName] = `${formatted}Z`
        } else {
          res[fieldName] = timestamp
        }
      } else {
        res[fieldName] = value ?? null
      }
    }

    // in case of an object, run the object transformation
    if (fieldDefinition.type === "object") {
      res[fieldName] = transformObject({
        data: value as Record<string, unknown>,
        dateFields,
        definition: fieldDefinition,
        transformFields,
      })
    }

    // in case of an array, run the array transformation
    if (fieldDefinition.type === "array") {
      res[fieldName] = transformArray({
        data: value as Record<string, unknown>[],
        dateFields,
        definition: fieldDefinition.items as JSONSchema7,
        transformFields,
      })
    }
  }
  return res
}

export const transformArray = ({
  data,
  definition,
  transformFields,
  dateFields,
}: TransformArrayInput) => {
  // in case we have a simple type like string, number, etc.
  // use the given data as return value
  if (definition.type !== "object") {
    return data
  }

  // otherwise run the transform object function
  // to generate the key/value pair
  // NOTE: Since I don't have array of arrays in my usecase
  // I didn't implemented the check for arrays
  // i assume that the return value should be always
  // an array of object or array of string/number/boolean

  return data.map((ele) =>
    transformObject({
      data: ele,
      dateFields,
      definition,
      transformFields,
    })
  )
}

export const transformObject = ({
  data,
  definition,
  transformFields,
  dateFields = [],
}: TransformInput) => {
  const res: Record<string, unknown> = {}

  // get the field names from the definition
  const definitionFields = Object.keys(definition.properties ?? {})

  const mappedData: [string, unknown][] = Array.isArray(data)
    ? definitionFields.map((key, index) => [key, data[index]])
    : definitionFields.map((key) => [key, null])

  const convertedData: Record<string, unknown> = {}
  for (const [key, value] of mappedData) {
    convertedData[key] = value
  }
  const normalizedData = convertedData

  for (const field of definitionFields) {
    // get the current property name
    const propName = transformFields?.[field] ?? field

    // get the definition for the current field
    const fieldDefinition = definition.properties?.[field] as
      | JSONSchema7
      | undefined

    if (!fieldDefinition) {
      continue
    }

    // in case the current value is a simple type, return it
    if (fieldDefinition.type !== "array" && fieldDefinition.type !== "object") {
      if (dateFields.includes(propName)) {
        const timestamp =
          normalizedData[field] && (normalizedData[field] as number) * 1000

        res[propName] = timestamp
      } else {
        res[propName] = normalizedData[field] ?? null
      }
    }

    // if the expected value for the current property is an object,
    // run the object transformation
    if (fieldDefinition.type === "object") {
      res[propName] = transformObject({
        data: normalizedData[field] as Record<string, unknown>,
        dateFields,
        definition: fieldDefinition.properties as JSONSchema7,
        transformFields,
      })
    }

    // if the expected value for the current property is an array,
    // run the array transformation
    if (fieldDefinition.type === "array") {
      res[propName] = transformArray({
        data: normalizedData[field] as Record<string, unknown>[],
        dateFields,
        definition: fieldDefinition.items as JSONSchema7,
        transformFields,
      })
    }
  }
  return res
}

/**
 * Converts the trino response element ( array of unknown ) to an object
 * based on the given keys. This function expects that
 * amount of keys matches the amount of value elements
 *
 * @example
 *  const keys = ["fieldName1", "fieldName2"]
 *  const values = ["value1", 42]
 *  const convert = convertTrinoResponse({keys, values})
 *  // Result:
 *  //[{"fieldName1": "value1", "fieldName2": 42}]
 * @param keys string[]
 * @param values unknown[]
 * @returns Record<string, unknown>
 */
export function convertTrinoResponse<T = Record<string, unknown>>({
  keys,
  values,
}: {
  keys: string[]
  values: unknown[]
}): T {
  const combined: [key: string, value: unknown][] = []

  for (const [valueIdx, value] of values.entries()) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    combined.push([keys[valueIdx]!, value])
  }

  return Object.fromEntries(combined) as T
}
