// oxlint-disable no-await-in-loop
import { existsSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { generateCode } from "@lakeql/file-generator"
import { generateConfig } from "@lakeql/file-generator/config"
import { generateInterface } from "@lakeql/file-generator/interface"
import { generateQuerySchema } from "@lakeql/file-generator/query-schema"
import type { GenerateModelProps } from "@lakeql/schema-generator/graphql-schema"
import { generateModel } from "@lakeql/schema-generator/graphql-schema"
import { generateJsonSchemaFromFields } from "@lakeql/schema-generator/json-schema"

import { runConfigRegistryGeneration } from "@/commands/config-registry"

import { deriveNames } from "./derive-names"
import { generateMutationSchema } from "./mutation-schema"
import type { EndpointDefinitionFormat } from "./schema"
import { serializeDeterministic } from "./serialize"

/**
 * Options for the unified generation pipeline.
 */
export interface GeneratePipelineOptions {
  /** The validated endpoint definition to generate from. */
  definition: EndpointDefinitionFormat
  /** The target output directory for generated files. */
  outputDir: string
  /** If true, skip config registry generation after writing files. */
  skipRegistry?: boolean
  /** Optional source path override for config registry resolution. */
  sourcePathOverride?: string
}

/**
 * A single generated file with its name and content.
 */
export interface GeneratedFile {
  fileName: string
  content: string
}

/**
 * Result of the generation pipeline.
 */
export interface GeneratePipelineResult {
  /** All generated files with their content. */
  files: GeneratedFile[]
  /** The output directory where files were written. */
  outputDir: string
}

/**
 * Unified generation pipeline that transforms an EndpointDefinitionFormat
 * into all output files (config.ts, interface.ts, query-schema.ts,
 * mutation-schema.ts, json-schema.json, endpoint.json).
 *
 * This pipeline is shared by both the `create-endpoint` and `pull` commands.
 */
export async function generateEndpoint(
  options: GeneratePipelineOptions
): Promise<GeneratePipelineResult> {
  const { definition, outputDir, skipRegistry, sourcePathOverride } = options
  const { catalog, schema, tableName, fields } = definition

  // 1. Derive names from schema and tableName
  const { baseClassName, queryName, mutationName } = deriveNames(
    schema,
    tableName
  )

  // 2. Convert FieldDefinition[] → JSON Schema
  const jsonSchema = generateJsonSchemaFromFields(fields)

  // 3. Generate models from JSON Schema
  const models = generateModel({
    isRoot: true,
    models: {},
    name: baseClassName,
    source: jsonSchema as unknown as GenerateModelProps["source"],
  })

  // 4. Extract filterFields, filterTypes, transformFields, dateTimeFields from models
  const mainModel = Object.values(models).find((ele) => ele.root === true)

  const filterFields = mainModel?.fields
    ? Object.values(mainModel.fields)
        .filter((ele) => ele.filter === true)
        .map((ele) => ({
          name: ele.name,
          type: ele.graphqlType,
        }))
    : []

  const filterTypes = [...new Set(filterFields.map((ele) => ele.type))]

  const transformFields = [
    ...new Set(
      Object.values(models)
        .filter((ele) => ele.transformFields.length > 0)
        .flatMap((ele) => ele.transformFields)
    ),
  ]

  const dateTimeFields = [
    ...new Set(
      Object.values(models)
        .filter((ele) => ele.dateTimeFields.length > 0)
        .flatMap((ele) => ele.dateTimeFields)
    ),
  ]

  // 5. Generate config.ts (with mutationName for mutation support)
  const generatedConfig = generateConfig({
    catalog,
    queryName,
    schema,
    tableName,
    mutationName: [mutationName],
    storageConfig: definition.mutation
      ? {
          loadStrategy: definition.mutation.loadStrategy,
          type: definition.mutation.type,
          bucket: definition.mutation.bucket,
          basePath: definition.mutation.basePath,
          region: definition.mutation.region,
          endpoint: definition.mutation.endpoint,
          partitioning:
            definition.mutation.loadStrategy === "full_load"
              ? undefined
              : definition.mutation.partitioning,
          partitioningFormat:
            definition.mutation.loadStrategy === "full_load"
              ? undefined
              : definition.mutation.partitioningFormat,
        }
      : undefined,
  })

  const configTemplate = await generateCode({
    fileName: "config.ts",
    nodes: generatedConfig,
  })

  // 6. Generate interface.ts
  const generatedInterface = generateInterface(models)
  const interfaceTemplate = await generateCode({
    fileName: "interface.ts",
    nodes: generatedInterface,
  })

  // 7. Generate query-schema.ts
  const generatedQuerySchema = generateQuerySchema({
    dateTimeFields,
    filterFields,
    filterTypes,
    models,
    queryName,
    transformFields,
  })

  const querySchemaTemplate = await generateCode({
    fileName: "query-schema.ts",
    nodes: generatedQuerySchema,
  })

  // 8. Generate mutation-schema.ts
  const hasValidations = fields.some(
    (field) =>
      field.options?.validations && field.options.validations.length > 0
  )

  const generatedMutationSchema = generateMutationSchema({
    models,
    mutationName,
    mutationConfig: definition.mutation,
    hasValidations,
    fieldDefinitions: fields,
  })

  // Only generate the file if there are nodes (stub returns empty)
  let mutationSchemaContent = ""
  if (generatedMutationSchema.length > 0) {
    const mutationSchemaTemplate = await generateCode({
      fileName: "mutation-schema.ts",
      nodes: generatedMutationSchema,
    })
    mutationSchemaContent = mutationSchemaTemplate.text
  }

  // 9. Serialize json-schema.json
  const jsonSchemaContent = serializeDeterministic(jsonSchema)

  // 10. Serialize endpoint.json via deterministic serializer
  const customEndpointContent = serializeDeterministic(definition)

  // Collect all generated files
  const files: GeneratedFile[] = [
    { fileName: "config.ts", content: configTemplate.text },
    { fileName: "interface.ts", content: interfaceTemplate.text },
    { fileName: "query-schema.ts", content: querySchemaTemplate.text },
    { fileName: "json-schema.json", content: jsonSchemaContent },
    { fileName: "endpoint.json", content: customEndpointContent },
  ]

  // Only include mutation-schema.ts if it has content
  if (mutationSchemaContent) {
    files.push({
      fileName: "mutation-schema.ts",
      content: mutationSchemaContent,
    })
  }

  // 11. Write all files to output directory (remove existing dir first, then recreate)
  if (existsSync(outputDir)) {
    await rm(outputDir, { force: true, recursive: true })
  }

  await mkdir(outputDir, { recursive: true })

  for (const file of files) {
    await writeFile(path.join(outputDir, file.fileName), file.content)
  }

  // 12. Trigger config registry generation unless --skip-registry
  if (!skipRegistry) {
    await runConfigRegistryGeneration(sourcePathOverride)
  }

  return { files, outputDir }
}
