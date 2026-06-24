import { TrinoClient } from "@lakeql/trino-client"
import { cli } from "cleye"
import ora from "ora"

import type { ConnectorType, SeedDefinition } from "./seed/config"
import { createSeedConnector } from "./seed/connectors"
import { MINITRINO } from "./seed/defaults"
import { seedDefinition } from "./seed/index"

const parsed = cli({
  name: "seed",
  flags: {
    all: {
      type: Boolean,
      default: false,
      description: "Seed all definitions from seed.config.ts",
    },
    definition: {
      type: [String],
      alias: "d",
      description: "Seed specific definition(s) by name (repeatable)",
    },
    amount: {
      type: Number,
      alias: "a",
      default: 1000,
      description: "Number of records to generate (default: 1000)",
    },
    connector: {
      type: String,
      alias: "c",
      description:
        'Connector override: "hive" | "clickhouse" (default: from definition)',
    },
  },
  strictFlags: true,
})

function validateConnector(
  value: string | undefined
): ConnectorType | undefined {
  if (!value) {
    return undefined
  }
  if (value !== "hive" && value !== "clickhouse") {
    // eslint-disable-next-line no-console
    console.error(
      `Invalid connector "${value}". Allowed values: hive, clickhouse`
    )
    process.exit(1)
  }
  return value
}

async function loadConfig(): Promise<SeedDefinition[]> {
  // Import the seed config from the project root (relative to test-data package)
  const configPath = new URL("../seed.config.ts", import.meta.url).href
  const configModule = await import(configPath)
  return configModule.default as SeedDefinition[]
}

function resolveDefinitions(
  allDefinitions: SeedDefinition[],
  flags: typeof parsed.flags
): SeedDefinition[] {
  if (flags.all) {
    return allDefinitions
  }

  if (flags.definition && flags.definition.length > 0) {
    const resolved: SeedDefinition[] = []
    for (const name of flags.definition) {
      const found = allDefinitions.find((d) => d.name === name)
      if (!found) {
        const available = allDefinitions.map((d) => d.name).join(", ")
        // eslint-disable-next-line no-console
        console.error(`Definition "${name}" not found. Available: ${available}`)
        process.exit(1)
      }
      resolved.push(found)
    }
    return resolved
  }

  // eslint-disable-next-line no-console
  console.error(
    "Please specify --all to seed everything, or --definition <name> to seed specific definitions.\n" +
      "Examples:\n" +
      "  pnpm seed --all\n" +
      "  pnpm seed -d products\n" +
      "  pnpm seed -d products -d orders"
  )
  process.exit(1)
}

async function main() {
  const { flags } = parsed

  // Load config
  const spinner = ora("Loading seed config...").start()
  let allDefinitions: SeedDefinition[]
  try {
    allDefinitions = await loadConfig()
    spinner.succeed(
      `Loaded ${allDefinitions.length} definition(s) from seed.config.ts`
    )
  } catch (error) {
    spinner.fail("Failed to load seed.config.ts")
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }

  // Resolve which definitions to seed
  const definitions = resolveDefinitions(allDefinitions, flags)
  const connectorOverride = validateConnector(flags.connector)
  const { amount } = flags

  // Create Trino client
  const client = new TrinoClient({
    host: MINITRINO.trino.host,
    port: MINITRINO.trino.port,
    auth: MINITRINO.trino.auth,
    catalog: MINITRINO.trino.catalog,
  })

  // Seed definitions
  let successCount = 0
  let failCount = 0

  for (const definition of definitions) {
    const connectorType = connectorOverride ?? definition.connector
    const connector = createSeedConnector(connectorType, client)
    const defSpinner = ora(
      `Seeding "${definition.name}" → ${MINITRINO.trino.catalog}.${definition.schema}.${definition.table}...`
    ).start()

    try {
      // oxlint-disable-next-line no-await-in-loop
      await seedDefinition(definition, connector, { amount })
      defSpinner.succeed(
        `${definition.name} → ${MINITRINO.trino.catalog}.${definition.schema}.${definition.table} (${amount} records)`
      )
      successCount += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const cause =
        error instanceof Error && error.cause instanceof Error
          ? `\n    Cause: ${error.cause.message}`
          : ""
      defSpinner.fail(`${definition.name} failed: ${message}${cause}`)
      failCount += 1
    }
  }

  // Summary
  // eslint-disable-next-line no-console
  console.log()
  if (failCount === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `Done. Seeded ${successCount}/${definitions.length} definition(s) successfully.`
    )
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `Done. ${successCount}/${definitions.length} succeeded, ${failCount} failed.`
    )
    process.exit(1)
  }
}

try {
  await main()
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exit(1)
}
