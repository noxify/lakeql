import { parser } from "json-column-parser"
import type { JSONType } from "json-column-parser/lib/common/types/type.common"

export type { JSONType } from "json-column-parser/lib/common/types/type.common"

export interface ParseFieldsProps {
  name: string
  type: string
  extra: string
  description: string
}

export const parseColumns = (elements: ParseFieldsProps[]) => {
  const fields: Record<string, JSONType> = {}
  const parsed = elements.map((element) => {
    /**
     * since the trino column type definition is a bit different
     * to what the `json-column-parser` expect, we have to update
     * the current column type definition
     *
     * In our case, we only have to remove some spaces after each `,``
     * and replace spaces between fieldname and type with an `:`
     */
    let custom_source = element.type.replaceAll(", ", ",")
    custom_source = custom_source.replaceAll(" ", ":")

    const columnType = parser.parseColumnType(custom_source)

    return {
      description: element.description,
      name: element.name,
      type: columnType,
    }
  })

  for (const fieldDef of parsed) {
    fields[fieldDef.name] = fieldDef.type
  }

  return fields
}
