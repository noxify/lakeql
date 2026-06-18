import type { JSONSchema7 } from "json-schema"
import { describe, expect, test } from "vitest"

import { generateModel } from "../src/graphql-schema"

describe(generateModel, () => {
  describe("primitives", () => {
    test("string", () => {
      const jsonSchema: JSONSchema7 = {
        additionalProperties: false,
        properties: {
          fieldName: {
            type: "string",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Simple",
        source: jsonSchema,
      })

      expect(models).toStrictEqual({
        Simple: {
          dateTimeFields: [],
          fields: {
            fieldName: {
              filter: true,
              graphqlTplType: "'String'",
              graphqlType: "String",
              interfaceName: undefined,
              interfaceType: "string",
              isArray: false,
              name: "fieldName",
              nullable: true,
              rawFieldName: "fieldName",
              transformed: false,
            },
          },
          interfaceName: "SimpleInterface",
          modelName: "Simple",
          root: true,
          transformFields: [],
        },
      })
    })
    test("number", () => {
      const jsonSchema: JSONSchema7 = {
        additionalProperties: false,
        properties: {
          fieldName: {
            type: "number",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Simple",
        source: jsonSchema,
      })

      expect(models).toStrictEqual({
        Simple: {
          dateTimeFields: [],
          fields: {
            fieldName: {
              filter: true,
              graphqlTplType: "'Float'",
              graphqlType: "Float",
              interfaceName: undefined,
              interfaceType: "number",
              isArray: false,
              name: "fieldName",
              nullable: true,
              rawFieldName: "fieldName",
              transformed: false,
            },
          },
          interfaceName: "SimpleInterface",
          modelName: "Simple",
          root: true,
          transformFields: [],
        },
      })
    })
    test("integer", () => {
      const jsonSchema: JSONSchema7 = {
        additionalProperties: false,
        properties: {
          fieldName: {
            type: "integer",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Simple",
        source: jsonSchema,
      })

      expect(models).toStrictEqual({
        Simple: {
          dateTimeFields: [],
          fields: {
            fieldName: {
              filter: true,
              graphqlTplType: "'Int'",
              graphqlType: "Int",
              interfaceName: undefined,
              interfaceType: "number",
              isArray: false,
              name: "fieldName",
              nullable: true,
              rawFieldName: "fieldName",
              transformed: false,
            },
          },
          interfaceName: "SimpleInterface",
          modelName: "Simple",
          root: true,
          transformFields: [],
        },
      })
    })
    test("boolean", () => {
      const jsonSchema: JSONSchema7 = {
        additionalProperties: false,
        properties: {
          fieldName: {
            type: "boolean",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Simple",
        source: jsonSchema,
      })

      expect(models).toStrictEqual({
        Simple: {
          dateTimeFields: [],
          fields: {
            fieldName: {
              filter: true,
              graphqlTplType: "'Boolean'",
              graphqlType: "Boolean",
              interfaceName: undefined,
              interfaceType: "boolean",
              isArray: false,
              name: "fieldName",
              nullable: true,
              rawFieldName: "fieldName",
              transformed: false,
            },
          },
          interfaceName: "SimpleInterface",
          modelName: "Simple",
          root: true,
          transformFields: [],
        },
      })
    })
    test("datetime", () => {
      const jsonSchema: JSONSchema7 = {
        additionalProperties: false,
        properties: {
          fieldName: {
            format: "date-time",
            type: "string",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Simple",
        source: jsonSchema,
      })

      expect(models).toStrictEqual({
        Simple: {
          dateTimeFields: ["fieldName"],
          fields: {
            fieldName: {
              filter: true,
              graphqlTplType: "'DateTime'",
              graphqlType: "DateTime",
              interfaceName: undefined,
              interfaceType: "Date",
              isArray: false,
              name: "fieldName",
              nullable: true,
              rawFieldName: "fieldName",
              transformed: false,
            },
          },
          interfaceName: "SimpleInterface",
          modelName: "Simple",
          root: true,
          transformFields: [],
        },
      })
    })
    test("date", () => {
      const jsonSchema: JSONSchema7 = {
        additionalProperties: false,
        properties: {
          fieldName: {
            format: "date",
            type: "string",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Simple",
        source: jsonSchema,
      })

      expect(models).toStrictEqual({
        Simple: {
          dateTimeFields: [],
          fields: {
            fieldName: {
              filter: true,
              graphqlTplType: "'Date'",
              graphqlType: "Date",
              interfaceName: undefined,
              interfaceType: "Date",
              isArray: false,
              name: "fieldName",
              nullable: true,
              rawFieldName: "fieldName",
              transformed: false,
            },
          },
          interfaceName: "SimpleInterface",
          modelName: "Simple",
          root: true,
          transformFields: [],
        },
      })
    })
    test("simple array", () => {
      const jsonSchema: JSONSchema7 = {
        additionalProperties: false,
        properties: {
          fieldName: {
            items: {
              type: "string",
            },
            type: "array",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Simple",
        source: jsonSchema,
      })

      expect(models).toStrictEqual({
        Simple: {
          dateTimeFields: [],
          fields: {
            fieldName: {
              filter: false,
              graphqlTplType: "['String']",
              graphqlType: "[String]",
              interfaceName: undefined,
              interfaceType: "string[]",
              isArray: true,
              name: "fieldName",
              nullable: true,
              rawFieldName: "fieldName",
              transformed: false,
            },
          },
          interfaceName: "SimpleInterface",
          modelName: "Simple",
          root: true,
          transformFields: [],
        },
      })
    })
  })

  describe("complex", () => {
    test("objects", () => {
      const jsonSchema: JSONSchema7 = {
        properties: {
          fieldName: {
            type: "string",
          },
          objField: {
            properties: {
              fieldName1: {
                type: "string",
              },
              fieldName2: {
                type: "integer",
              },
            },
            type: "object",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Objects",
        source: jsonSchema,
      })

      expect(Object.keys(models)).toHaveLength(2)
      expect(models).toStrictEqual({
        Objects: {
          dateTimeFields: [],
          fields: {
            fieldName: {
              filter: true,
              graphqlTplType: "'String'",
              graphqlType: "String",
              interfaceName: undefined,
              interfaceType: "string",
              isArray: false,
              name: "fieldName",
              nullable: true,
              rawFieldName: "fieldName",
              transformed: false,
            },

            objField: {
              filter: false,
              graphqlTplType: "Objects_Objfield",
              graphqlType: "Objects_Objfield",
              interfaceName: "Objects_ObjfieldInterface",
              interfaceType: "Objects_Objfield",
              isArray: false,
              name: "objField",
              nullable: true,
              rawFieldName: "objField",
              transformed: false,
            },
          },
          interfaceName: "ObjectsInterface",
          modelName: "Objects",
          root: true,
          transformFields: [],
        },
        Objects_Objfield: {
          dateTimeFields: [],
          fields: {
            fieldName1: {
              filter: true,
              graphqlTplType: "'String'",
              graphqlType: "String",
              interfaceName: undefined,
              interfaceType: "string",
              isArray: false,
              name: "fieldName1",
              nullable: true,
              rawFieldName: "fieldName1",
              transformed: false,
            },
            fieldName2: {
              filter: true,
              graphqlTplType: "'Int'",
              graphqlType: "Int",
              interfaceName: undefined,
              interfaceType: "number",
              isArray: false,
              name: "fieldName2",
              nullable: true,
              rawFieldName: "fieldName2",
              transformed: false,
            },
          },
          interfaceName: "Objects_ObjfieldInterface",
          modelName: "Objects_Objfield",
          root: false,
          transformFields: [],
        },
      })
    })

    test("array of objects", () => {
      const jsonSchema: JSONSchema7 = {
        properties: {
          fieldName: {
            type: "string",
          },
          objField: {
            items: {
              properties: {
                fieldName1: {
                  type: "string",
                },
                fieldName2: {
                  type: "integer",
                },
              },
              type: "object",
            },
            type: "array",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Objects",
        source: jsonSchema,
      })

      expect(Object.keys(models)).toHaveLength(2)
      expect(models).toStrictEqual({
        Objects: {
          dateTimeFields: [],
          fields: {
            fieldName: {
              filter: true,
              graphqlTplType: "'String'",
              graphqlType: "String",
              interfaceName: undefined,
              interfaceType: "string",
              isArray: false,
              name: "fieldName",
              nullable: true,
              rawFieldName: "fieldName",
              transformed: false,
            },

            objField: {
              filter: false,
              graphqlTplType: "[Objects_Objfield]",
              graphqlType: "[Objects_Objfield]",
              interfaceName: "Objects_ObjfieldInterface[]",
              interfaceType: "Objects_Objfield[]",
              isArray: true,
              name: "objField",
              nullable: true,
              rawFieldName: "objField",
              transformed: false,
            },
          },
          interfaceName: "ObjectsInterface",
          modelName: "Objects",
          root: true,
          transformFields: [],
        },
        Objects_Objfield: {
          dateTimeFields: [],
          fields: {
            fieldName1: {
              filter: true,
              graphqlTplType: "'String'",
              graphqlType: "String",
              interfaceName: undefined,
              interfaceType: "string",
              isArray: false,
              name: "fieldName1",
              nullable: true,
              rawFieldName: "fieldName1",
              transformed: false,
            },
            fieldName2: {
              filter: true,
              graphqlTplType: "'Int'",
              graphqlType: "Int",
              interfaceName: undefined,
              interfaceType: "number",
              isArray: false,
              name: "fieldName2",
              nullable: true,
              rawFieldName: "fieldName2",
              transformed: false,
            },
          },
          interfaceName: "Objects_ObjfieldInterface",
          modelName: "Objects_Objfield",
          root: false,
          transformFields: [],
        },
      })
    })

    test("special characters", () => {
      const jsonSchema: JSONSchema7 = {
        properties: {
          fieldName: {
            type: "string",
          },
          flußöffnung: {
            items: {
              properties: {
                Hörgerät: {
                  type: "string",
                },
                fieldName2: {
                  type: "integer",
                },
              },
              type: "object",
            },
            type: "array",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Objects",
        source: jsonSchema,
      })

      expect(Object.keys(models)).toHaveLength(2)
      expect(models).toStrictEqual({
        Objects: {
          dateTimeFields: [],
          fields: {
            fieldName: {
              filter: true,
              graphqlTplType: "'String'",
              graphqlType: "String",
              interfaceName: undefined,
              interfaceType: "string",
              isArray: false,
              name: "fieldName",
              nullable: true,
              rawFieldName: "fieldName",
              transformed: false,
            },

            flussoeffnung: {
              filter: false,
              graphqlTplType: "[Objects_Flussoeffnung]",
              graphqlType: "[Objects_Flussoeffnung]",
              interfaceName: "Objects_FlussoeffnungInterface[]",
              interfaceType: "Objects_Flussoeffnung[]",
              isArray: true,
              name: "flussoeffnung",
              nullable: true,
              rawFieldName: "flußöffnung",
              transformed: true,
            },
          },
          interfaceName: "ObjectsInterface",
          modelName: "Objects",
          root: true,
          transformFields: [["flussoeffnung", "flußöffnung"]],
        },
        Objects_Flussoeffnung: {
          dateTimeFields: [],
          fields: {
            Hoergeraet: {
              filter: true,
              graphqlTplType: "'String'",
              graphqlType: "String",
              interfaceName: undefined,
              interfaceType: "string",
              isArray: false,
              name: "Hoergeraet",
              nullable: true,
              rawFieldName: "Hörgerät",
              transformed: true,
            },
            fieldName2: {
              filter: true,
              graphqlTplType: "'Int'",
              graphqlType: "Int",
              interfaceName: undefined,
              interfaceType: "number",
              isArray: false,
              name: "fieldName2",
              nullable: true,
              rawFieldName: "fieldName2",
              transformed: false,
            },
          },
          interfaceName: "Objects_FlussoeffnungInterface",
          modelName: "Objects_Flussoeffnung",
          root: false,
          transformFields: [["Hoergeraet", "Hörgerät"]],
        },
      })
    })

    test("normalizes invalid identifiers", () => {
      const jsonSchema: JSONSchema7 = {
        properties: {
          "   ": {
            type: "string",
          },
          "status des preises": {
            type: "string",
          },
          "datum preisermittlung": {
            type: "integer",
          },
        },
        type: "object",
      }

      const models = generateModel({
        isRoot: true,
        models: {},
        name: "Objects",
        source: jsonSchema,
      })

      expect(models).toStrictEqual({
        Objects: {
          dateTimeFields: [],
          fields: {
            field: {
              filter: true,
              graphqlTplType: "'String'",
              graphqlType: "String",
              interfaceName: undefined,
              interfaceType: "string",
              isArray: false,
              name: "field",
              nullable: true,
              rawFieldName: "   ",
              transformed: true,
            },
            status_des_preises: {
              filter: true,
              graphqlTplType: "'String'",
              graphqlType: "String",
              interfaceName: undefined,
              interfaceType: "string",
              isArray: false,
              name: "status_des_preises",
              nullable: true,
              rawFieldName: "status des preises",
              transformed: true,
            },
            datum_preisermittlung: {
              filter: true,
              graphqlTplType: "'Int'",
              graphqlType: "Int",
              interfaceName: undefined,
              interfaceType: "number",
              isArray: false,
              name: "datum_preisermittlung",
              nullable: true,
              rawFieldName: "datum preisermittlung",
              transformed: true,
            },
          },
          interfaceName: "ObjectsInterface",
          modelName: "Objects",
          root: true,
          transformFields: [
            ["field", "   "],
            ["status_des_preises", "status des preises"],
            ["datum_preisermittlung", "datum preisermittlung"],
          ],
        },
      })
    })
  })
})
