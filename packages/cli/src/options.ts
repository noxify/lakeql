import { Option } from "@commander-js/extra-typings"

import { getInvocationCwd } from "@/path-utils"

/**
 * Creates the catalog option with a default value from env.
 * Accepts the catalog value as parameter to avoid importing env at module level
 * (which would cause env validation to fail for commands that don't need it).
 */
export function catalogOption(defaultCatalog: string) {
  return new Option("--catalog <catalog>", "catalog to use").default(
    defaultCatalog,
    "configured catalog in the .env file"
  )
}

export const schemaOption = new Option("--schema <schema>", "schema to use")

export const tableOption = new Option("--table <table>", "table to use")

export const tableOrSchemaOption = new Option(
  "--type <type>",
  "Show tables or views"
)

export const sourcePathOption = new Option(
  "--source-path <path>",
  "Base path for generated code (resolved from the command invocation directory). Files are created in `schemas/generated` inside this path."
).default(getInvocationCwd(), "command invocation directory")

export const skipRegistry = new Option(
  "--skip-registry",
  "Skip config registry generation"
).default(false)
