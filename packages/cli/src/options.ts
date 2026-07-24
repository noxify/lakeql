import { InvalidArgumentError, Option } from "@commander-js/extra-typings"

import { getInvocationCwd } from "@/path-utils"

export const DEFAULT_PULL_CONCURRENCY = 8

function parsePositiveInteger(value: string) {
  const parsed = Math.trunc(Number(value))

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("must be a positive integer")
  }

  return parsed
}

export function createCatalogOption() {
  return new Option("--catalog <catalog>", "catalog to use").env("HIVE_CATALOG")
}

export function createSchemaOption() {
  return new Option("--schema <schema>", "schema to use")
}

export function createTableOption() {
  return new Option("--table <table>", "table to use")
}

export function createTableOrSchemaOption() {
  return new Option("--type <type>", "Show tables or views")
}

export function createSourcePathOption() {
  return new Option(
    "--source-path <path>",
    "Base path for generated code (resolved from the command invocation directory). Files are created in `schemas/generated|custom` inside this path."
  ).default(getInvocationCwd(), "command invocation directory")
}

export function createSkipRegistryOption() {
  return new Option(
    "--skip-registry",
    "Skip config registry generation"
  ).default(false)
}

export function createConcurrencyOption() {
  return new Option(
    "--concurrency <count>",
    "Maximum number of concurrent pull operations for multi-item pulls."
  )
    .argParser(parsePositiveInteger)
    .default(DEFAULT_PULL_CONCURRENCY)
}
