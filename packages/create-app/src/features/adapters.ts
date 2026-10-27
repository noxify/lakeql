/**
 * Adapter feature definitions.
 * Each adapter declares its env vars, schema, and structured config.
 * `opsForAdapters()` transforms selections into Ops for the plan.
 */

import type { Op, TsValue } from "@lakeql/scaffold"
import { expr } from "@lakeql/scaffold"

export interface AdapterDefinition {
  id: string
  label: string
  package: string
  /** Name of the `AdapterDefinition` export registered in `defineConfig`. */
  definitionExport: string
  available: boolean
  envVars: Record<string, string>
  envSchema: Record<string, string>
  buildConfig: (dsName: string) => Record<string, TsValue>
}

export const ADAPTERS: AdapterDefinition[] = [
  {
    id: "trino",
    label: "Trino",
    package: "@lakeql/adapter-trino",
    definitionExport: "trinoAdapterDefinition",
    available: true,
    envVars: {
      TRINO_HOST: '"http://localhost"',
      TRINO_PORT: "8080",
      TRINO_CATALOG: "hive",
      TRINO_USERNAME: "admin",
      TRINO_PASSWORD: '"secret123"',
      TRINO_SOURCE: '"lakeql"',
    },
    envSchema: {
      TRINO_CATALOG: "string().min(1)",
      TRINO_HOST: "string().min(1)",
      TRINO_PASSWORD: "string().min(1)",
      TRINO_PORT: "coerce.number().default(8080)",
      TRINO_SOURCE: "string().optional()",
      TRINO_USERNAME: "string().min(1)",
    },
    buildConfig: () => ({
      connection: {
        auth: {
          password: expr("env.TRINO_PASSWORD"),
          type: "basic",
          username: expr("env.TRINO_USERNAME"),
        },
        catalog: expr("env.TRINO_CATALOG"),
        host: expr("env.TRINO_HOST"),
        port: expr("env.TRINO_PORT"),
        source: expr("env.TRINO_SOURCE"),
      },
    }),
  },
  {
    id: "fabric",
    label: "Microsoft Fabric",
    package: "@lakeql/adapter-fabric",
    definitionExport: "fabricAdapterDefinition",
    available: true,
    envVars: {
      FABRIC_HOST: '"your-workspace.datawarehouse.fabric.microsoft.com"',
      FABRIC_PORT: "1433",
      FABRIC_CATALOG: "my_lakehouse",
      FABRIC_TENANT_ID: '"YOUR_TENANT_ID"',
      FABRIC_CLIENT_ID: '"your-fabric-client-id"',
      FABRIC_CLIENT_SECRET: '"your-fabric-client-secret"',
    },
    envSchema: {
      FABRIC_CATALOG: "string().min(1)",
      FABRIC_CLIENT_ID: "string().min(1)",
      FABRIC_CLIENT_SECRET: "string().min(1)",
      FABRIC_HOST: "string().min(1)",
      FABRIC_PORT: "coerce.number().default(1433)",
      FABRIC_TENANT_ID: "string().min(1)",
    },
    buildConfig: () => ({
      connection: {
        auth: {
          clientId: expr("env.FABRIC_CLIENT_ID"),
          clientSecret: expr("env.FABRIC_CLIENT_SECRET"),
          tenantId: expr("env.FABRIC_TENANT_ID"),
          type: "oauth2",
        },
        catalog: expr("env.FABRIC_CATALOG"),
        host: expr("env.FABRIC_HOST"),
        port: expr("env.FABRIC_PORT"),
      },
    }),
  },
  {
    id: "clickhouse",
    label: "ClickHouse",
    package: "@lakeql/adapter-clickhouse",
    definitionExport: "clickhouseAdapterDefinition",
    available: false,
    envVars: {},
    envSchema: {},
    buildConfig: () => ({}),
  },
  {
    id: "duckdb",
    label: "DuckDB",
    package: "@lakeql/adapter-duckdb",
    definitionExport: "duckdbAdapterDefinition",
    available: false,
    envVars: {},
    envSchema: {},
    buildConfig: () => ({}),
  },
]

export const DEFAULT_DS_NAMES: Record<string, string> = {
  fabric: "fabric",
  trino: "trino",
}

/**
 * Generate Ops for a set of selected adapters with their data source names.
 */
export function opsForAdapters(
  adapters: AdapterDefinition[],
  dsNames: Record<string, string>
): Op[] {
  const ops: Op[] = []

  for (const adapter of adapters) {
    const name = dsNames[adapter.id] ?? adapter.id

    ops.push(
      { type: "addDeps", deps: { [adapter.package]: "workspace:*" } },
      {
        type: "addAdapter",
        package: adapter.package,
        definitionExport: adapter.definitionExport,
      }
    )

    if (Object.keys(adapter.envVars).length > 0) {
      ops.push({
        type: "addEnvVars",
        group: `${adapter.label} data source`,
        vars: adapter.envVars,
      })
    }

    if (Object.keys(adapter.envSchema).length > 0) {
      ops.push({ type: "addEnvSchema", schema: adapter.envSchema })
    }

    const config = adapter.buildConfig(name)
    if (Object.keys(config).length > 0) {
      ops.push({
        type: "addDataSource",
        adapter: adapter.id,
        config,
        merge: "deep",
        name,
      })
    }
  }

  return ops
}
