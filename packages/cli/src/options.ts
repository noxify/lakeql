import { Option } from "@commander-js/extra-typings"

import { env } from "@/env"
import { getInvocationCwd } from "@/path-utils"

export const catalogOption = new Option(
  "--catalog <catalog>",
  "catalog to use"
).default(env.HIVE_CATALOG, "configured catalog in the .env file")

export const schemaOption = new Option("--schema <schema>", "schema to use")

export const tableOption = new Option("--table <table>", "table to use")

export const tableOrSchemaOption = new Option(
  "--type <type>",
  "Show tables or views"
)

export const targetOption = new Option(
  "--target <path>",
  "Target path for generated schemas (resolved from the command invocation directory). Files are created in `schemas/generated` inside this path."
).default(getInvocationCwd(), "command invocation directory")

export const schemaPathOption = new Option(
  "--schema-path <path>",
  "Path to schema files (resolved from the command invocation directory). If you used a custom `--target`, use the same base path here."
).default(getInvocationCwd(), "command invocation directory")

export const skipRegistry = new Option(
  "--skip-registry",
  "Skip config registry generation"
).default(false)
