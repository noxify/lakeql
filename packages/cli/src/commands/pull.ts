// oxlint-disable no-await-in-loop
import { existsSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { Command } from "@commander-js/extra-typings"
import { parseColumns } from "@lakeql/column-parser"
import { generateCode } from "@lakeql/file-generator"
import { generateConfig } from "@lakeql/file-generator/config"
import { generateInterface } from "@lakeql/file-generator/interface"
import { generateQuerySchema } from "@lakeql/file-generator/query-schema"
import { error } from "@lakeql/logger/console"
import { convertTrinoResponse } from "@lakeql/response-transformer"
import { generateModel } from "@lakeql/schema-generator/graphql-schema"
import { generateJsonSchema } from "@lakeql/schema-generator/json-schema"
import { TrinoClient } from "@lakeql/trino-client"
import { multiselect, select, validators } from "@topcli/prompts"
import { camelCase, upperFirst } from "lodash-es"

import { resolveSourcePath } from "@/config"
import { env } from "@/env"
import {
  catalogOption,
  schemaOption,
  skipRegistry as skipRegistryOption,
  sourcePathOption,
  tableOption,
  tableOrSchemaOption,
} from "@/options"

import { runConfigRegistryGeneration } from "./config-registry"

export default function PullCommand() {
  const program = new Command("pull")
  const pullCommand = program
    .description(
      "Interactive query endpoint generation based on a remote table"
    )
    .addOption(catalogOption)
    .addOption(tableOrSchemaOption)
    .addOption(schemaOption.makeOptionMandatory(false))
    .addOption(
      tableOption
        .makeOptionMandatory(false)
        .default([])
        .argParser((value, previous: string[]) => [...previous, value])
    )
    .addOption(skipRegistryOption)
    .addOption(sourcePathOption)

  pullCommand.action(async (props) => {
    const { catalog, skipRegistry, sourcePath } = props
    let { schema, table: tables, type } = props

    // CLI --source-path overrides config; if it's the default (invocation cwd), use config
    const cliOverride =
      // oxlint-disable-next-line no-restricted-properties
      sourcePath === (process.env.INIT_CWD ?? process.cwd())
        ? undefined
        : sourcePath
    const resolvedTargetPath = resolveSourcePath(cliOverride)

    const trinoClient = new TrinoClient({
      auth: {
        password: env.HIVE_PASSWORD,
        type: "basic",
        username: env.HIVE_USERNAME,
      },
      catalog,
      host: env.HIVE_HOST,
      port: env.HIVE_PORT,
    })

    if (!schema) {
      const remoteSchemas = await trinoClient.schemas({ catalog })

      schema = await select(`Choose a schema from the ${catalog} catalog`, {
        autocomplete: true,
        choices: remoteSchemas,
      })
    }

    if (tables.length === 0) {
      type ??= await select(
        `What do you want to see from  ${catalog}/${schema}`,
        {
          choices: [
            { label: "Show tables", value: "tables" },
            { label: "Show views", value: "views" },
          ],
        }
      )
    }

    if (tables.length === 0) {
      let remoteTables: string[] = []
      remoteTables =
        type === "views"
          ? await trinoClient.views({ catalog, schema })
          : await trinoClient.tables({ catalog, schema })

      if (remoteTables.length === 0) {
        program.error(
          error(`There are no tables in schema '${catalog}.${schema}'.`),
          {
            exitCode: 0,
          }
        )
      }

      tables = await multiselect("Choose the tables to pull", {
        autocomplete: true,
        choices: remoteTables,
        validators: [validators.required()],
      })
    }

    for (const table of tables) {
      const baseClassName = `${upperFirst(camelCase(schema))}_${upperFirst(camelCase(table))}`
      const queryName = `${camelCase(schema)}${upperFirst(camelCase(table))}`

      const columns = await trinoClient.columns({
        catalog,
        schema,
        table,
      })

      const transformedResponse = columns.map((values) =>
        convertTrinoResponse<{
          name: string
          type: string
          extra: string
          description: string
        }>({
          keys: ["name", "type", "extra", "description"],
          values,
        })
      )

      const parsedColumns = parseColumns(transformedResponse)
      const jsonSchema = generateJsonSchema(parsedColumns)

      const models = generateModel({
        isRoot: true,
        models: {},
        name: baseClassName,
        source: jsonSchema,
      })

      const mainModel = Object.values(models).find((ele) => ele.root === true)

      // get all filterable fields from the main model
      const filterFields = mainModel?.fields
        ? Object.values(mainModel.fields)
            .filter((ele) => ele.filter === true)
            .map((ele) => ({
              name: ele.name,
              type: ele.graphqlType,
            }))
        : []

      // get a unique list of possible filter types
      // this will be used later in the file generation
      const filterTypes = [...new Set(filterFields.map((ele) => ele.type))]

      // fetch all transformFields and generate a unique list
      // the result is something like
      // [["transformedName", "rawName"]]
      const transformFields = [
        ...new Set(
          Object.values(models)
            .filter((ele) => ele.transformFields.length > 0)
            .flatMap((ele) => ele.transformFields)
        ),
      ]

      // fetch all date/time fields and generate a unique list
      // this was previously implemented in the `query-schema.ts``
      // and calculated based on the json schema
      const dateTimeFields = [
        ...new Set(
          Object.values(models)
            .filter((ele) => ele.dateTimeFields.length > 0)
            .flatMap((ele) => ele.dateTimeFields)
        ),
      ]

      const targetPath = path.join(
        resolvedTargetPath,
        "schemas/generated",
        catalog,
        schema,
        table
      )

      // generate the config file
      const generatedConfig = generateConfig({
        catalog,
        queryName,
        schema,
        tableName: table,
      })

      const configTemplate = await generateCode({
        fileName: "config.ts",
        nodes: generatedConfig,
      })

      // generate the interfaces
      const generatedInterface = generateInterface(models)
      const interfaceTemplate = await generateCode({
        fileName: "interface.ts",
        nodes: generatedInterface,
      })

      // generate the query schema
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

      if (existsSync(targetPath)) {
        await rm(targetPath, { force: true, recursive: true })
      }

      await mkdir(targetPath, { recursive: true })

      await writeFile(
        path.join(targetPath, configTemplate.fileName),
        configTemplate.text
      )
      await writeFile(
        path.join(targetPath, interfaceTemplate.fileName),
        interfaceTemplate.text
      )
      await writeFile(
        path.join(targetPath, querySchemaTemplate.fileName),
        querySchemaTemplate.text
      )
      await writeFile(
        path.join(targetPath, "json-schema.json"),
        `${JSON.stringify(jsonSchema, null, 2)}\n`
      )

      if (!skipRegistry) {
        await runConfigRegistryGeneration(cliOverride)
      }
      //await writeFile(join(targetPath, "model_definition.json"), JSON.stringify(models, null, 2))
    }
  })

  return pullCommand
}
