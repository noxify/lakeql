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
      mutationConfig: {
        loadStrategy: "full_load",
        basePath: "test/path",
      },
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
      mutationConfig: {
        loadStrategy: "full_load",
        basePath: "test/path",
      },
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
      mutationConfig: {
        loadStrategy: "full_load",
        basePath: "test/path",
      },
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
      mutationConfig: {
        loadStrategy: "full_load",
        basePath: "test/path",
      },
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
      mutationConfig: {
        loadStrategy: "full_load",
        basePath: "test/path",
      },
    })

    const output = printNodes(result)

    expect(output).toContain("t.boolean(")
    expect(output).toContain("t.arg(")
    expect(output).toContain("Test_ModelInput")
    // The input arg is an array type [<Model>Input!]! so a batch of records
    // can be written in a single mutation.
    expect(output).toContain("type: [Test_ModelInput]")
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

  it("generates a resolver that writes via context.getWriteStrategy", () => {
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

    // Imports: sourceConfig + storageConfig from ./config; no stale imports
    expect(output).toContain('import { builder } from "@lakeql/api/builder"')
    expect(output).toContain(
      'import { sourceConfig, storageConfig } from "./config"'
    )
    expect(output).toContain('import jsonSchema from "./json-schema.json"')
    expect(output).not.toContain("@lakeql/trino-client")
    expect(output).not.toContain("TrinoClient")
    expect(output).not.toContain("executeWritePipeline")
    expect(output).not.toContain('"~/env"')
    expect(output).not.toContain("hiveConfig")
    expect(output).not.toContain("HIVE_")

    // Resolver resolves the write strategy from the context and writes
    expect(output).toContain(
      "context.getWriteStrategy(sourceConfig.dataSource)"
    )
    expect(output).toContain("writeStrategy.write")
    expect(output).toContain("records: input")
    expect(output).toContain("schema: jsonSchema")

    // The input arg is an array type so the resolver receives a batch of records
    expect(output).toContain("type: [Test_ModelInput]")

    // Write config is built from sourceConfig + storageConfig
    expect(output).toContain("sourceConfig.catalog")
    expect(output).toContain("sourceConfig.schema")
    expect(output).toContain("sourceConfig.tableName")
    expect(output).toContain("storageConfig.loadStrategy")
    expect(output).toContain("storageConfig.basePath")

    // Should NOT import validationSchema when hasValidations is not set
    expect(output).not.toContain("validationSchema")

    // Should still have input types and mutationFields
    expect(output).toContain("Test_ModelInput")
    expect(output).toContain("builder.mutationFields")
    expect(output).toContain("return true")
  })

  it("emits partitioning in the write config only when configured", () => {
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

    const withoutPartitioning = printNodes(
      generateMutationSchema({
        models,
        mutationName: "createTestModel",
        mutationConfig: {
          loadStrategy: "full_load",
          basePath: "warehouse/test/data",
        },
      })
    )
    expect(withoutPartitioning).not.toContain("storageConfig.partitioning")

    const withPartitioning = printNodes(
      generateMutationSchema({
        models,
        mutationName: "createTestModel",
        mutationConfig: {
          loadStrategy: "full_load_append",
          basePath: "warehouse/test/data",
          partitioning: "event_date",
          partitioningFormat: "year/month/day",
        },
      })
    )
    expect(withPartitioning).toContain("storageConfig.partitioning")
    expect(withPartitioning).toContain("storageConfig.partitioningFormat")
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

    // Should validate each record in the batch (input is an array)
    expect(output).toContain("input.forEach(")
    expect(output).toContain("validationSchema.parse(record)")
    expect(output).not.toContain("validationSchema.parse(input)")
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

    // loadStrategy and basePath now come from storageConfig at runtime, not hardcoded
    expect(output).toContain("storageConfig.loadStrategy")
    expect(output).toContain("storageConfig.basePath")
  })
})
