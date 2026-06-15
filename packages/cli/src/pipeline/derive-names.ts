import { camelCase, upperFirst } from "lodash-es"

export interface DerivedNames {
  baseClassName: string
  queryName: string
  mutationName: string
}

export function deriveNames(schema: string, tableName: string): DerivedNames {
  const baseClassName = `${upperFirst(camelCase(schema))}_${upperFirst(camelCase(tableName))}`
  const queryName = `${camelCase(schema)}${upperFirst(camelCase(tableName))}`
  const mutationName = `create${camelCase(schema)}${upperFirst(camelCase(tableName))}`

  return { baseClassName, queryName, mutationName }
}
