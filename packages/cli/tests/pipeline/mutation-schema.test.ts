// oxlint-disable vitest/max-expects
import type { ModelResponse } from "@lakeql/schema-generator/graphql-schema"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { generateMutationSchema } from "@/pipeline/mutation-schema"

/**
 * Helper to print AST nodes to a string for assertion.
 */
function printNodes(nodes: ts.Node[]): string {
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    omitTrailingSemicolon: true,
  })
  const sourceFile = ts.createSourceFile(
    "test.ts",
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  )
  return nodes
    .map((node) => printer.printNode(ts.EmitHint.Unspecified, node, sourceFile))
    .join("\n\n")
}

describe(generateMutationSchema, () => {
  it("generates import, input type, and mutationFields for a simple flat model", () => {
    const models: Record<string, ModelResponse> = {
      Tracking_UserEvents: {
        root: true,
        modelName: "Tracking_UserEvents",
        interfaceName: "Tracking_UserEventsInterface",
        fields: {
          event_id: {
            name: "event_id",
            rawFieldName: "event_id",
            transformed: false,
            interfaceType: "string",
            graphqlType: "String",
            graphqlTplType: "'String'",
            isArray: false,
            nullable: true,
            filter: true,
          },
          user_count: {
            name: "user_count",
            rawFieldName: "user_count",
            transformed: false,
            interfaceType: "number",
            graphqlType: "Int",
            graphqlTplType: "'Int'",
            isArray: false,
            nullable: true,
            filter: true,
          },
        },
        transformFields: [],
        dateTimeFields: [],
      },
    }

    const result = generateMutationSchema({
      models,
      mutationName: "createTrackingUserEvents",
    })

    const output = printNodes(result)

    expect(output).toContain('import { builder } from "../../builder"')
    expect(output).toContain("Tracking_UserEventsInput")
    expect(output).toContain('builder.inputType("Tracking_UserEventsInput"')
    expect(output).toContain("t.string(")
    expect(output).toContain("t.int(")
    expect(output).toContain("builder.mutationFields")
    expect(output).toContain("createTrackingUserEvents")
    expect(output).toContain("async")
    expect(output).toContain("return true")
    expect(output).toContain("TODO: Implement write logic here")
  })

  it("generates separate input types for nested Object fields", () => {
    const models: Record<string, ModelResponse> = {
      Tracking_UserEvents_Metadata: {
        root: false,
        modelName: "Tracking_UserEvents_Metadata",
        interfaceName: "Tracking_UserEvents_MetadataInterface",
        fields: {
          source: {
            name: "source",
            rawFieldName: "source",
            transformed: false,
            interfaceType: "string",
            graphqlType: "String",
            graphqlTplType: "'String'",
            isArray: false,
            nullable: true,
            filter: true,
          },
          version: {
            name: "version",
            rawFieldName: "version",
            transformed: false,
            interfaceType: "number",
            graphqlType: "Float",
            graphqlTplType: "'Float'",
            isArray: false,
            nullable: true,
            filter: true,
          },
        },
        transformFields: [],
        dateTimeFields: [],
      },
      Tracking_UserEvents: {
        root: true,
        modelName: "Tracking_UserEvents",
        interfaceName: "Tracking_UserEventsInterface",
        fields: {
          event_id: {
            name: "event_id",
            rawFieldName: "event_id",
            transformed: false,
            interfaceType: "string",
            graphqlType: "String",
            graphqlTplType: "'String'",
            isArray: false,
            nullable: true,
            filter: true,
          },
          metadata: {
            name: "metadata",
            rawFieldName: "metadata",
            transformed: false,
            interfaceType: "Tracking_UserEvents_Metadata",
            graphqlType: "Tracking_UserEvents_Metadata",
            graphqlTplType: "Tracking_UserEvents_Metadata",
            isArray: false,
            interfaceName: "Tracking_UserEvents_MetadataInterface",
            nullable: true,
            filter: false,
          },
        },
        transformFields: [],
        dateTimeFields: [],
      },
    }

    const result = generateMutationSchema({
      models,
      mutationName: "createTrackingUserEvents",
    })

    const output = printNodes(result)

    expect(output).toContain(
      'builder.inputType("Tracking_UserEvents_MetadataInput"'
    )

    const nestedPos = output.indexOf("Tracking_UserEvents_MetadataInput")
    const rootPos = output.indexOf(
      'builder.inputType("Tracking_UserEventsInput"'
    )
    expect(nestedPos).toBeLessThan(rootPos)

    expect(output).toContain("Tracking_UserEvents_MetadataInput")
    expect(output).toContain("t.field(")
  })

  it("generates list type for Array fields with primitive elements", () => {
    const models: Record<string, ModelResponse> = {
      Tracking_UserEvents: {
        root: true,
        modelName: "Tracking_UserEvents",
        interfaceName: "Tracking_UserEventsInterface",
        fields: {
          tags: {
            name: "tags",
            rawFieldName: "tags",
            transformed: false,
            interfaceType: "string[]",
            graphqlType: "[String]",
            graphqlTplType: "['String']",
            isArray: true,
            nullable: true,
            filter: false,
          },
        },
        transformFields: [],
        dateTimeFields: [],
      },
    }

    const result = generateMutationSchema({
      models,
      mutationName: "createTrackingUserEvents",
    })

    const output = printNodes(result)

    expect(output).toContain("t.stringList(")
  })

  it("generates list type for Array fields with Object elements", () => {
    const models: Record<string, ModelResponse> = {
      Tracking_UserEvents_Dimensions: {
        root: false,
        modelName: "Tracking_UserEvents_Dimensions",
        interfaceName: "Tracking_UserEvents_DimensionsInterface",
        fields: {
          key: {
            name: "key",
            rawFieldName: "key",
            transformed: false,
            interfaceType: "string",
            graphqlType: "String",
            graphqlTplType: "'String'",
            isArray: false,
            nullable: true,
            filter: true,
          },
          value: {
            name: "value",
            rawFieldName: "value",
            transformed: false,
            interfaceType: "string",
            graphqlType: "String",
            graphqlTplType: "'String'",
            isArray: false,
            nullable: true,
            filter: true,
          },
        },
        transformFields: [],
        dateTimeFields: [],
      },
      Tracking_UserEvents: {
        root: true,
        modelName: "Tracking_UserEvents",
        interfaceName: "Tracking_UserEventsInterface",
        fields: {
          dimensions: {
            name: "dimensions",
            rawFieldName: "dimensions",
            transformed: false,
            interfaceType: "Tracking_UserEvents_Dimensions[]",
            graphqlType: "[Tracking_UserEvents_Dimensions]",
            graphqlTplType: "[Tracking_UserEvents_Dimensions]",
            isArray: true,
            interfaceName: "Tracking_UserEvents_DimensionsInterface[]",
            nullable: true,
            filter: false,
          },
        },
        transformFields: [],
        dateTimeFields: [],
      },
    }

    const result = generateMutationSchema({
      models,
      mutationName: "createTrackingUserEvents",
    })

    const output = printNodes(result)

    expect(output).toContain(
      'builder.inputType("Tracking_UserEvents_DimensionsInput"'
    )
    expect(output).toContain("Tracking_UserEvents_DimensionsInput")
    expect(output).toContain("t.field(")
  })

  it("returns empty array when no root model exists", () => {
    const models: Record<string, ModelResponse> = {}

    const result = generateMutationSchema({
      models,
      mutationName: "createSomething",
    })

    expect(result).toStrictEqual([])
  })

  it("generates Boolean resolver return type", () => {
    const models: Record<string, ModelResponse> = {
      Test_Model: {
        root: true,
        modelName: "Test_Model",
        interfaceName: "Test_ModelInterface",
        fields: {
          id: {
            name: "id",
            rawFieldName: "id",
            transformed: false,
            interfaceType: "string",
            graphqlType: "String",
            graphqlTplType: "'String'",
            isArray: false,
            nullable: true,
            filter: true,
          },
        },
        transformFields: [],
        dateTimeFields: [],
      },
    }

    const result = generateMutationSchema({
      models,
      mutationName: "createTestModel",
    })

    const output = printNodes(result)

    expect(output).toContain("t.boolean(")
    expect(output).toContain("t.arg(")
    expect(output).toContain("Test_ModelInput")
  })
})
