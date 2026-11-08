import type { JSONSchema7 } from "json-schema"
import { describe, expect, it } from "vitest"

import { generateFieldDefinition, generateModel } from "../src/graphql-schema"

/**
 * Characterization test pinning the schema generator's `toCapitalize`-dependent
 * output across the `lodash-es` → `es-toolkit` migration.
 *
 * `generateFieldDefinition` capitalizes the sanitized field name via
 * `@lakeql/helpers`'s `toCapitalize`, and nested model keys are built as
 * `${parent}_${toCapitalize(name)}`. `sanitizeFieldName` first maps the German
 * umlauts/ligatures it knows (`ü`→`ue`, `ß`→`ss`, …) and then replaces every
 * remaining non-`[A-Za-z0-9_]` character with `_`, so the string reaching
 * `toCapitalize` is always ASCII. The expectations below were captured from the
 * previously installed `lodash-es@4.18.1` `capitalize` and must stay identical
 * now that `toCapitalize` sources from `es-toolkit/compat` — both produce the
 * same result on ASCII input.
 *
 * Field names deliberately carry diacritics (`caféField`, `naïve_obj`,
 * `überCount`) to exercise the sanitize → capitalize path end-to-end.
 */
describe("schema generator capitalize characterization (vs lodash-es@4.18.1)", () => {
  it("produces stable names for diacritic field names", () => {
    const jsonSchema: JSONSchema7 = {
      properties: {
        caféField: { type: "string" },
        naïve_obj: {
          properties: { überCount: { type: "integer" } },
          type: "object",
        },
      },
      type: "object",
    }

    const models = generateModel({
      isRoot: true,
      models: {},
      name: "Diacritics",
      source: jsonSchema,
    })

    expect(models).toStrictEqual({
      Diacritics: {
        dateTimeFields: [],
        fields: {
          caf_Field: {
            filter: true,
            graphqlTplType: "'String'",
            graphqlType: "String",
            interfaceName: undefined,
            interfaceType: "string",
            isArray: false,
            name: "caf_Field",
            nullable: true,
            rawFieldName: "caféField",
            transformed: true,
          },
          na_ve_obj: {
            filter: false,
            graphqlTplType: "Diacritics_Na_ve_obj",
            graphqlType: "Diacritics_Na_ve_obj",
            interfaceName: "Diacritics_Na_ve_objInterface",
            interfaceType: "Diacritics_Na_ve_obj",
            isArray: false,
            name: "na_ve_obj",
            nullable: true,
            rawFieldName: "naïve_obj",
            transformed: true,
          },
        },
        interfaceName: "DiacriticsInterface",
        modelName: "Diacritics",
        root: true,
        transformFields: [
          ["caf_Field", "caféField"],
          ["na_ve_obj", "naïve_obj"],
        ],
      },
      Diacritics_Na_ve_obj: {
        dateTimeFields: [],
        fields: {
          ueberCount: {
            filter: true,
            graphqlTplType: "'Int'",
            graphqlType: "Int",
            interfaceName: undefined,
            interfaceType: "number",
            isArray: false,
            name: "ueberCount",
            nullable: true,
            rawFieldName: "überCount",
            transformed: true,
          },
        },
        interfaceName: "Diacritics_Na_ve_objInterface",
        modelName: "Diacritics_Na_ve_obj",
        root: false,
        transformFields: [["ueberCount", "überCount"]],
      },
    })
  })

  it("capitalizes a sanitized diacritic field name into nested type references", () => {
    // sanitizeFieldName("caféField") === "caf_Field"; lodash capitalize → "Caf_field"
    const field = generateFieldDefinition({
      fieldDefinition: { type: "object", properties: {} },
      fieldName: "caf_Field",
      parent: "Parent",
      rawFieldName: "caféField",
    })

    expect(field.graphqlType).toBe("Parent_Caf_field")
    expect(field.interfaceName).toBe("Parent_Caf_fieldInterface")
  })
})
