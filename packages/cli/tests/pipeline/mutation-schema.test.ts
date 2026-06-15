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
  it("returns empty array when mutationConfig is undefined (no legacy mode)", () => {
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

    expect(result).toStrictEqual([])
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
      mutationConfig: { loadStrategy: "full_load", basePath: "test/path" },
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
      mutationConfig: { loadStrategy: "full_load", basePath: "test/path" },
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
      mutationConfig: { loadStrategy: "full_load", basePath: "test/path" },
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
      mutationConfig: { loadStrategy: "full_load", basePath: "test/path" },
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
      mutationConfig: { loadStrategy: "full_load", basePath: "test/path" },
    })

    const output = printNodes(result)

    expect(output).toContain("t.boolean(")
    expect(output).toContain("t.arg(")
    expect(output).toContain("Test_ModelInput")
  })

  it("returns empty array when mutationConfig is false", () => {
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
      mutationConfig: false,
    })

    expect(result).toStrictEqual([])
  })

  it("generates a real resolver with executeWritePipeline when mutationConfig is present", () => {
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
      mutationConfig: {
        loadStrategy: "full_load",
        basePath: "warehouse/test/data",
      },
    })

    const output = printNodes(result)

    // Should have real resolver imports
    expect(output).toContain(
      'import { executeWritePipeline } from "@lakeql/adapters"'
    )
    expect(output).toContain(
      'import { TrinoClient } from "@lakeql/trino-client"'
    )
    expect(output).toContain('import { builder } from "@lakeql/api/builder"')
    expect(output).toContain('import { env } from "~/env"')
    expect(output).toContain('import { hiveConfig } from "./config"')
    expect(output).toContain('import jsonSchema from "./json-schema.json"')

    // Should NOT import validationSchema when hasValidations is not set
    expect(output).not.toContain("validationSchema")

    // Should contain the executeWritePipeline call
    expect(output).toContain("executeWritePipeline")
    expect(output).toContain("full_load")
    expect(output).toContain("warehouse/test/data")

    // Should contain config object with env-based S3 config
    expect(output).toContain("env.S3_BUCKET")
    expect(output).toContain("env.S3_REGION")
    expect(output).toContain("env.S3_ENDPOINT")
    expect(output).toContain("env.S3_ACCESS_KEY_ID")
    expect(output).toContain("env.S3_SECRET_ACCESS_KEY")

    // Should contain hiveConfig references
    expect(output).toContain("hiveConfig.catalog")
    expect(output).toContain("hiveConfig.schema")
    expect(output).toContain("hiveConfig.tableName")

    // Should still have input types and mutationFields
    expect(output).toContain("Test_ModelInput")
    expect(output).toContain("builder.mutationFields")
    expect(output).toContain("return true")

    // Should NOT have the placeholder TODO
    expect(output).not.toContain("TODO: Implement write logic here")
  })

  it("imports validationSchema when hasValidations is true", () => {
    const models: Record<string, ModelResponse> = {
      Test_Model: {
        root: true,
        modelName: "Test_Model",
        interfaceName: "Test_ModelInterface",
        fields: {
          email: {
            name: "email",
            rawFieldName: "email",
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
      mutationConfig: {
        loadStrategy: "append",
        basePath: "warehouse/test/data",
      },
      hasValidations: true,
    })

    const output = printNodes(result)

    // Should import validationSchema
    expect(output).toContain('import { validationSchema } from "./validations"')

    // Should call validationSchema.parse(input)
    expect(output).toContain("validationSchema.parse(input)")
  })

  it("uses the configured loadStrategy in the generated resolver", () => {
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
      mutationConfig: {
        loadStrategy: "full_load_append",
        basePath: "my/custom/path",
      },
    })

    const output = printNodes(result)

    expect(output).toContain("full_load_append")
    expect(output).toContain("my/custom/path")
  })
})
