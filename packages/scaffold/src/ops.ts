/**
 * Operations and Plan system for declarative project scaffolding.
 * Features emit Ops, which are reduced into a Plan that builders consume.
 */

import { deepmerge } from "deepmerge-ts"

import type { TsValue } from "./ts-serializer"

// === Operation types ===

export interface AddDataSourceOp {
  type: "addDataSource"
  /** Key in the dataSources object (e.g. "trino") */
  name: string
  /** Adapter identifier (e.g. "trino") */
  adapter: string
  /** Structured config object (uses expr() for code references) */
  config: Record<string, TsValue>
  /** How to handle existing entries: "replace" or "deep" merge (default: "deep") */
  merge?: "replace" | "deep"
}

export interface AddEnvVarsOp {
  type: "addEnvVars"
  /** Key-value pairs for .env.example */
  vars: Record<string, string>
  /**
   * Human-readable section label for `.env.example` grouping (e.g.
   * "Authentication", "Trino"). Vars without a group fall into a default
   * "General" section. Groups appear in the order they are first emitted.
   */
  group?: string
}

export interface AddEnvSchemaOp {
  type: "addEnvSchema"
  /** Key → Zod schema string for src/env.ts */
  schema: Record<string, string>
}

export interface AddDepsOp {
  type: "addDeps"
  /** Package name → version range */
  deps: Record<string, string>
  /** If true, add to devDependencies instead */
  dev?: boolean
}

export interface AddFileOp {
  type: "addFile"
  /** Relative path from project root (e.g. "src/auth.ts") */
  path: string
  /** File content */
  content: string
}

export interface AddAdapterOp {
  type: "addAdapter"
  /** Adapter package to import the definition from (e.g. "@lakeql/adapter-trino"). */
  package: string
  /** Name of the `AdapterDefinition` export to register (e.g. "trinoAdapterDefinition"). */
  definitionExport: string
}

export type Op =
  | AddDataSourceOp
  | AddEnvVarsOp
  | AddEnvSchemaOp
  | AddDepsOp
  | AddFileOp
  | AddAdapterOp

// === Plan ===

export interface Plan {
  dataSources: Record<
    string,
    { adapter: string; config: Record<string, TsValue> }
  >
  /** Adapter definitions to register in `defineConfig`, in insertion order. */
  adapters: { package: string; definitionExport: string }[]
  /**
   * Env vars for `.env.example`, grouped into labelled sections in the order
   * the groups are first emitted (auth, then data sources by selection order).
   */
  envGroups: { group: string; vars: Record<string, string> }[]
  envSchema: Record<string, string>
  deps: Record<string, string>
  devDeps: Record<string, string>
  /** Additional files to write (path → content) */
  files: Record<string, string>
}

export function createPlan(): Plan {
  return {
    adapters: [],
    dataSources: {},
    deps: {},
    devDeps: {},
    envGroups: [],
    envSchema: {},
    files: {},
  }
}

// === Apply ===

export function applyOp(plan: Plan, op: Op): Plan {
  switch (op.type) {
    case "addDataSource": {
      const prev = plan.dataSources[op.name]
      const next = { adapter: op.adapter, config: op.config }

      if (prev) {
        if (prev.adapter !== op.adapter) {
          throw new Error(
            `DataSource "${op.name}" already uses "${prev.adapter}", cannot change to "${op.adapter}".`
          )
        }
        plan.dataSources[op.name] =
          op.merge === "replace"
            ? next
            : {
                adapter: prev.adapter,
                config: deepmerge(prev.config, op.config),
              }
      } else {
        plan.dataSources[op.name] = next
      }
      break
    }
    case "addEnvVars": {
      const group = op.group ?? "General"
      const existing = plan.envGroups.find((g) => g.group === group)
      if (existing) {
        Object.assign(existing.vars, op.vars)
      } else {
        plan.envGroups.push({ group, vars: { ...op.vars } })
      }
      break
    }
    case "addEnvSchema": {
      Object.assign(plan.envSchema, op.schema)
      break
    }
    case "addDeps": {
      Object.assign(op.dev ? plan.devDeps : plan.deps, op.deps)
      break
    }
    case "addFile": {
      plan.files[op.path] = op.content
      break
    }
    case "addAdapter": {
      const exists = plan.adapters.some(
        (a) => a.definitionExport === op.definitionExport
      )
      if (!exists) {
        plan.adapters.push({
          package: op.package,
          definitionExport: op.definitionExport,
        })
      }
      break
    }
    default: {
      break
    }
  }
  return plan
}

/**
 * Reduce an array of Ops into a Plan.
 */
export function buildPlan(ops: Op[]): Plan {
  let plan = createPlan()
  for (const op of ops) {
    plan = applyOp(plan, op)
  }
  return plan
}
