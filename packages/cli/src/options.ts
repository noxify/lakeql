import { Option } from "@commander-js/extra-typings"

import { getInvocationCwd } from "@/path-utils"

export const catalogOption = new Option(
  "--catalog <catalog>",
  "catalog to use"
).env("HIVE_CATALOG")

export const schemaOption = new Option("--schema <schema>", "schema to use")

export const tableOption = new Option("--table <table>", "table to use")

export const tableOrSchemaOption = new Option(
  "--type <type>",
  "Show tables or views"
)

export const sourcePathOption = new Option(
  "--source-path <path>",
  "Base path for generated code (resolved from the command invocation directory). Files are created in `schemas/generated|custom` inside this path."
).default(getInvocationCwd(), "command invocation directory")

export const skipRegistry = new Option(
  "--skip-registry",
  "Skip config registry generation"
).default(false)
