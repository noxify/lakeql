import replaceSpecialCharacters from "@lakeql/helpers/special-characters"
import type { JSONSchema7 } from "json-schema"
import { capitalize, omit } from "lodash-es"

export interface CurrentModelResponse {
  name: string
  rawFieldName: string
  transformed: boolean
  interfaceType: string
  graphqlType: string
  graphqlTplType: string
  isArray: boolean
  interfaceName?: string
  nullable: boolean
  filter: boolean
}

export interface ModelResponse {
  root: boolean
  modelName: string
  interfaceName: string
  fields: Record<string, CurrentModelResponse>
  transformFields: string[][]
  dateTimeFields: string[]
}

export interface FilterFieldInput {
  name: string
  type: string
}

export type FieldDefinitionResponse =
  | {
      graphqlType: string
      graphqlTplType: string
      interfaceType: string
      isArray?: boolean
      interfaceName?: string
      subModel: false
      filter: boolean
    }
  | {
      graphqlType: string
      graphqlTplType: string
      interfaceType: string
      isArray?: boolean
      interfaceName?: string
      subModel: JSONSchema7
      filter: boolean
    }

export const generateModel = ({
  source,
  name,
  parent,
  models = {},
  isRoot = true,
}: {
  source: JSONSchema7
  name: string
  parent?: string
  models: Record<string, ModelResponse>
  isRoot: boolean
}) => {
  const currentElement = omit(source, ["additionalProperties"])
  const nestedModels: Record<string, ModelResponse> = { ...models }

  const currentModel: Record<string, CurrentModelResponse> = {}
  for (const [rawFieldName, fieldDefinition] of Object.entries(
    currentElement.properties as JSONSchema7
  )) {
    const fieldName = replaceSpecialCharacters(rawFieldName).replace("-", "_")

    const field = generateFieldDefinition({
      fieldDefinition: fieldDefinition as JSONSchema7,
      fieldName,
      parent: parent ?? name,
      rawFieldName,
    })
    currentModel[fieldName] = {
      filter: field.filter,
      graphqlTplType: field.graphqlTplType,
      graphqlType: field.graphqlType,
      interfaceName: field.interfaceName,
      interfaceType: field.interfaceType,
      isArray: field.isArray ?? false,
      name: fieldName,
      nullable: true,
      rawFieldName,
      transformed: fieldName !== rawFieldName,
    }

    if (field.subModel === false) {
      continue
    }

    Object.assign(
      nestedModels,
      generateModel({
        isRoot: false,
        models: nestedModels,
        name: fieldName,
        parent: parent ?? name,
        source: field.subModel,
      })
    )
  }

  const modelKey = isRoot ? name : `${parent}_${capitalize(name)}`

  nestedModels[modelKey] = {
    dateTimeFields: Object.values(currentModel)
      .filter((ele) => ele.graphqlType === "DateTime")
      .map((ele) => ele.rawFieldName),
    fields: currentModel,
    interfaceName: `${modelKey}Interface`,
    modelName: modelKey,
    root: isRoot,
    transformFields: Object.values(currentModel)
      .filter((ele) => ele.transformed)
      .map((ele) => [ele.name, ele.rawFieldName]),
  }

  return nestedModels
}

export const generateFieldDefinition = ({
  fieldName,
  rawFieldName,
  fieldDefinition,
  parent,
}: {
  fieldName: string
  rawFieldName: string
  fieldDefinition: JSONSchema7
  parent?: string
}): FieldDefinitionResponse => {
  const capitalizedName = capitalize(fieldName)
  switch (fieldDefinition.type) {
    case "string": {
      switch (fieldDefinition.format) {
        case "date": {
          return {
            filter: true,
            graphqlTplType: "'Date'",
            graphqlType: "Date",
            interfaceType: "Date",
            subModel: false,
          }
        }

        case "date-time": {
          return {
            filter: true,
            graphqlTplType: "'DateTime'",
            graphqlType: "DateTime",
            interfaceType: "Date",
            subModel: false,
          }
        }
        default: {
          return {
            filter: true,
            graphqlTplType: "'String'",
            graphqlType: "String",
            interfaceType: "string",
            subModel: false,
          }
        }
      }
    }

    case "number": {
      return {
        filter: true,
        graphqlTplType: "'Float'",
        graphqlType: "Float",
        interfaceType: "number",
        subModel: false,
      }
    }

    case "integer": {
      return {
        filter: true,
        graphqlTplType: "'Int'",
        graphqlType: "Int",
        interfaceType: "number",
        subModel: false,
      }
    }

    case "boolean": {
      return {
        filter: true,
        graphqlTplType: "'Boolean'",
        graphqlType: "Boolean",
        interfaceType: "boolean",
        subModel: false,
      }
    }

    case "array": {
      if ((fieldDefinition.items as JSONSchema7).type !== "object") {
        const subType = generateFieldDefinition({
          fieldDefinition: fieldDefinition.items as JSONSchema7,
          fieldName,
          rawFieldName,
        })

        return {
          filter: false,
          graphqlTplType: `['${subType.graphqlType}']`,
          graphqlType: `[${subType.graphqlType}]`,
          interfaceType: `${subType.interfaceType}[]`,
          isArray: true,
          subModel: false,
        }
      }
      return {
        filter: false,
        graphqlTplType: `[${parent}_${capitalizedName}]`,
        graphqlType: `[${parent}_${capitalizedName}]`,
        interfaceName: `${parent}_${capitalizedName}Interface[]`,
        interfaceType: `${parent}_${capitalizedName}[]`,
        isArray: true,
        subModel: fieldDefinition.items as JSONSchema7,
      }
    }

    case "object": {
      return {
        filter: false,
        graphqlTplType: `${parent}_${capitalizedName}`,
        graphqlType: `${parent}_${capitalizedName}`,
        interfaceName: `${parent}_${capitalizedName}Interface`,
        interfaceType: `${parent}_${capitalizedName}`,
        subModel: fieldDefinition,
      }
    }

    default: {
      return {
        filter: false,
        graphqlTplType: "Null",
        graphqlType: "Null",
        interfaceType: "null",
        subModel: false,
      }
    }
  }
}
