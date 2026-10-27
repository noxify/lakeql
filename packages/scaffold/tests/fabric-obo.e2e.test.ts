import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { applyFeature } from "../src/apply-feature"
import { fabricOboTemplate } from "../src/features/fabric-obo"
import type { FeatureContext } from "../src/features/types"
import { buildPlan, expr, materializeFiles } from "../src/index"
import type { Op } from "../src/ops"

/**
 * End-to-end check for `fabric-obo` against a scaffolded Fabric project.
 *
 * The flow mirrors the real command: scaffold a Fabric project with the shared
 * greenfield materializer, run the template's `build` + `applyFeature`, then
 * apply the printed guidance (the two user-authored TypeScript files) by hand
 * and type-check the project. The type-check proves the guidance is correct and
 * complete; a final re-run proves idempotency.
 *
 * The project type-checks against the real dependency types by borrowing the
 * `examples/fabric-only` install (`@azure/identity`, `zod`, `@t3-oss/env-core`,
 * `@lakeql/config`) via a `node_modules` symlink — no isolated install needed.
 */

const EXAMPLE_DIR = fileURLToPath(
  new URL("../../../examples/fabric-only", import.meta.url)
)
const EXAMPLE_NODE_MODULES = path.join(EXAMPLE_DIR, "node_modules")
const TSC_BIN = path.join(EXAMPLE_NODE_MODULES, ".bin", "tsc")

/** The ops create-app emits for a Fabric-only project (greenfield scaffold). */
const fabricScaffoldOps: Op[] = [
  {
    type: "addAdapter",
    package: "@lakeql/adapter-fabric",
    definitionExport: "fabricAdapterDefinition",
  },
  {
    type: "addEnvVars",
    group: "Microsoft Fabric data source",
    vars: {
      FABRIC_CATALOG: "my_lakehouse",
      FABRIC_CLIENT_ID: '"your-fabric-client-id"',
      FABRIC_CLIENT_SECRET: '"your-fabric-client-secret"',
      FABRIC_HOST: '"your-workspace.datawarehouse.fabric.microsoft.com"',
      FABRIC_PORT: "1433",
      FABRIC_TENANT_ID: '"YOUR_TENANT_ID"',
    },
  },
  {
    type: "addEnvSchema",
    schema: {
      FABRIC_CATALOG: "string().min(1)",
      FABRIC_CLIENT_ID: "string().min(1)",
      FABRIC_CLIENT_SECRET: "string().min(1)",
      FABRIC_HOST: "string().min(1)",
      FABRIC_PORT: "coerce.number().default(1433)",
      FABRIC_TENANT_ID: "string().min(1)",
    },
  },
  {
    type: "addDataSource",
    name: "fabric",
    adapter: "fabric",
    config: {
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
    },
  },
]

/** A `tsconfig.json` matching the fabric-only example's strictness. */
const PROJECT_TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022"],
      module: "Preserve",
      moduleResolution: "Bundler",
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      types: ["node"],
    },
    include: ["src", "lakeql.config.ts"],
  },
  null,
  2
)}\n`

/** Build the context the template consumes from the scaffolded project. */
function fabricContext(projectDir: string): FeatureContext {
  const packageJson = JSON.parse(
    readFileSync(path.join(projectDir, "package.json"), "utf-8")
  ) as FeatureContext["packageJson"]

  return {
    projectDir,
    packageJson,
    inputs: {},
  }
}

/**
 * Apply the printed env-schema guidance into `src/env.ts` by inserting the
 * `OBO_*` lines inside the `server: { … }` object, simulating the user
 * following the next steps.
 */
function applyEnvSchemaGuidance(projectDir: string, guidance: string[]): void {
  const schemaLines = guidance
    .flatMap((entry) => entry.split("\n"))
    .filter((line) => /^ {4}OBO_\w+:/u.test(line))
  expect(schemaLines.length).toBeGreaterThan(0)

  const envPath = path.join(projectDir, "src", "env.ts")
  const content = readFileSync(envPath, "utf-8")
  const marker = "server: {\n"
  const index = content.indexOf(marker)
  expect(index).toBeGreaterThanOrEqual(0)

  const insertAt = index + marker.length
  const insertion = `${schemaLines.join("\n")}\n`
  writeFileSync(
    envPath,
    content.slice(0, insertAt) + insertion + content.slice(insertAt),
    "utf-8"
  )
}

/**
 * Apply the printed config-wiring guidance into `lakeql.config.ts`: add the
 * resolver import and attach `impersonationResolver` to the Fabric source.
 */
function applyConfigGuidance(projectDir: string, guidance: string[]): void {
  const importLine = guidance
    .flatMap((line) => line.split("\n"))
    .map((line) => line.trim())
    .find((line) => line.startsWith("import { fabricImpersonationResolver }"))
  expect(importLine).toBeDefined()

  const configPath = path.join(projectDir, "lakeql.config.ts")
  const content = readFileSync(configPath, "utf-8")

  // Add the import after the existing `env` import.
  const envImport = 'import { env } from "./src/env"\n'
  const withImport = content.replace(
    envImport,
    `${envImport}${importLine as string}\n`
  )

  // Attach the resolver inside the "fabric" data source object.
  const dsMarker = '    fabric: {\n      adapter: "fabric",\n'
  expect(withImport.includes(dsMarker)).toBeTruthy()
  const wired = withImport.replace(
    dsMarker,
    `${dsMarker}      impersonationResolver: fabricImpersonationResolver,\n`
  )

  writeFileSync(configPath, wired, "utf-8")
}

function typecheck(projectDir: string): void {
  execFileSync(
    TSC_BIN,
    ["--noEmit", "-p", path.join(projectDir, "tsconfig.json")],
    {
      cwd: projectDir,
      stdio: "pipe",
    }
  )
}

describe("fabric-obo end-to-end", () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), "fabric-obo-e2e-"))

    // Scaffold a Fabric project the same way create-app does: a greenfield
    // plan materialized by the shared engine, plus the package.json create-app
    // writes separately. create-app's template ships an existing `src/`, so
    // create it before materializing (the materializer does not mkdir).
    mkdirSync(path.join(projectDir, "src"), { recursive: true })
    const plan = buildPlan(fabricScaffoldOps)
    materializeFiles(projectDir, plan, "write")

    writeFileSync(
      path.join(projectDir, "package.json"),
      `${JSON.stringify(
        {
          name: "fabric-e2e",
          type: "module",
          dependencies: {
            "@lakeql/adapter-fabric": "workspace:*",
            "@lakeql/config": "workspace:*",
            "@t3-oss/env-core": "0.13.11",
            zod: "4.6.5",
          },
        },
        null,
        2
      )}\n`,
      "utf-8"
    )
    writeFileSync(
      path.join(projectDir, "tsconfig.json"),
      PROJECT_TSCONFIG,
      "utf-8"
    )

    // Resolve the real dependency types from the example install.
    symlinkSync(
      EXAMPLE_NODE_MODULES,
      path.join(projectDir, "node_modules"),
      "dir"
    )
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  it("requires the example install to be present", () => {
    // The type-check borrows the example's installed dependency types; without
    // them the assertion below would silently pass a weaker test.
    expect(existsSync(TSC_BIN)).toBeTruthy()
    expect(
      existsSync(path.join(EXAMPLE_NODE_MODULES, "@azure", "identity"))
    ).toBeTruthy()
  })

  it("applies fabric-obo, follows the guidance, and type-checks", () => {
    const ctx = fabricContext(projectDir)
    fabricOboTemplate.checkPreconditions(ctx)
    const result = fabricOboTemplate.build(ctx)
    const outcome = applyFeature(result, { projectDir })

    // Auto-applied: resolver file, dependency, and .env.example keys.
    expect(
      existsSync(
        path.join(projectDir, "src", "fabric-impersonation-resolver.ts")
      )
    ).toBeTruthy()

    const pkg = JSON.parse(
      readFileSync(path.join(projectDir, "package.json"), "utf-8")
    ) as { dependencies: Record<string, string> }
    expect(pkg.dependencies["@azure/identity"]).toBe("4.14.0")

    const envExample = readFileSync(
      path.join(projectDir, ".env.example"),
      "utf-8"
    )
    for (const key of [
      "OBO_CLIENT_ID",
      "OBO_CLIENT_SECRET",
      "OBO_FABRIC_SCOPE",
      "OBO_TENANT_ID",
    ]) {
      expect(envExample).toContain(`${key}=`)
    }

    // Before applying the guidance the resolver references undeclared
    // `OBO_*` env keys, so the project does not type-check yet.
    expect(() => typecheck(projectDir)).toThrow(/Command failed/u)

    // Follow the printed guidance for the two user-authored TypeScript files.
    applyEnvSchemaGuidance(projectDir, outcome.guidance)
    applyConfigGuidance(projectDir, outcome.guidance)

    // The guidance is correct and complete iff the project now type-checks.
    expect(() => typecheck(projectDir)).not.toThrow()
  }, 60_000)

  it("is a no-op when the command is run a second time", () => {
    const ctx = fabricContext(projectDir)
    const result = fabricOboTemplate.build(ctx)

    applyFeature(result, { projectDir })
    const pkgAfterFirst = readFileSync(
      path.join(projectDir, "package.json"),
      "utf-8"
    )
    const envAfterFirst = readFileSync(
      path.join(projectDir, ".env.example"),
      "utf-8"
    )
    const resolverAfterFirst = readFileSync(
      path.join(projectDir, "src", "fabric-impersonation-resolver.ts"),
      "utf-8"
    )

    const second = applyFeature(result, { projectDir })

    expect(second.applied).toStrictEqual([
      "skipped file src/fabric-impersonation-resolver.ts (already exists)",
    ])
    expect(readFileSync(path.join(projectDir, "package.json"), "utf-8")).toBe(
      pkgAfterFirst
    )
    expect(readFileSync(path.join(projectDir, ".env.example"), "utf-8")).toBe(
      envAfterFirst
    )
    expect(
      readFileSync(
        path.join(projectDir, "src", "fabric-impersonation-resolver.ts"),
        "utf-8"
      )
    ).toBe(resolverAfterFirst)
  })
})
