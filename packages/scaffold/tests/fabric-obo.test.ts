import { describe, expect, it } from "vitest"

import { fabricOboTemplate } from "../src/features/fabric-obo"
import type { FeatureContext } from "../src/features/types"
import type {
  AddDepsOp,
  AddEnvSchemaOp,
  AddEnvVarsOp,
  AddFileOp,
} from "../src/ops"

/** Build a project context with the given dependencies and resolved inputs. */
function context(
  dependencies: Record<string, string>,
  inputs: Record<string, string | undefined> = {}
): FeatureContext {
  return {
    projectDir: "/tmp/project",
    packageJson: { name: "demo", dependencies },
    inputs,
  }
}

describe("fabric-obo preconditions", () => {
  it("passes when the Fabric adapter is a dependency", () => {
    expect(() =>
      fabricOboTemplate.checkPreconditions(
        context({ "@lakeql/adapter-fabric": "workspace:*" })
      )
    ).not.toThrow()
  })

  it("passes when the Fabric adapter is a devDependency", () => {
    const ctx: FeatureContext = {
      projectDir: "/tmp/project",
      packageJson: {
        name: "demo",
        devDependencies: { "@lakeql/adapter-fabric": "workspace:*" },
      },
      inputs: {},
    }
    expect(() => fabricOboTemplate.checkPreconditions(ctx)).not.toThrow()
  })

  it("throws when the Fabric adapter is not a dependency", () => {
    expect(() =>
      fabricOboTemplate.checkPreconditions(
        context({ "@lakeql/adapter-trino": "workspace:*" })
      )
    ).toThrow(/requires the Fabric adapter/u)
  })
})

describe("fabric-obo build", () => {
  const fabricDeps = { "@lakeql/adapter-fabric": "workspace:*" }

  it("pins @azure/identity to the exact fabric-only version", () => {
    const { ops } = fabricOboTemplate.build(context(fabricDeps))
    const deps = ops.find((op): op is AddDepsOp => op.type === "addDeps")

    expect(deps?.deps).toStrictEqual({ "@azure/identity": "4.14.0" })
  })

  it("declares the OBO_* env vars and schema with the Warehouse scope default", () => {
    const { ops } = fabricOboTemplate.build(context(fabricDeps))
    const vars = ops.find((op): op is AddEnvVarsOp => op.type === "addEnvVars")
    const schema = ops.find(
      (op): op is AddEnvSchemaOp => op.type === "addEnvSchema"
    )

    expect(Object.keys(vars?.vars ?? {}).toSorted()).toStrictEqual([
      "OBO_CLIENT_ID",
      "OBO_CLIENT_SECRET",
      "OBO_FABRIC_SCOPE",
      "OBO_TENANT_ID",
    ])
    expect(schema?.schema.OBO_FABRIC_SCOPE).toContain(
      "https://database.windows.net/.default"
    )
  })

  it("contributes the data-source-name-independent resolver file", () => {
    const { ops } = fabricOboTemplate.build(context(fabricDeps))
    const file = ops.find((op): op is AddFileOp => op.type === "addFile")

    expect(file?.path).toBe("src/fabric-impersonation-resolver.ts")
    expect(file?.content).toContain('if (adapter !== "fabric")')
    expect(file?.content).toContain("OnBehalfOfCredential")
  })

  it("wires in the adapter-prefixed resolver import and property", () => {
    const { nextSteps } = fabricOboTemplate.build(context(fabricDeps))
    const joined = nextSteps.join("\n")

    expect(joined).toContain(
      'import { fabricImpersonationResolver } from "./src/fabric-impersonation-resolver"'
    )
    expect(joined).toContain(
      "impersonationResolver: fabricImpersonationResolver,"
    )
  })

  it("keeps the wiring guidance generic over data sources", () => {
    const { nextSteps } = fabricOboTemplate.build(context(fabricDeps))

    const wiring = nextSteps.find((step) =>
      step.includes("each of your Fabric")
    )
    expect(wiring).toBeDefined()
  })

  it("documents the Azure delegated permissions and admin consent", () => {
    const { nextSteps } = fabricOboTemplate.build(context(fabricDeps))
    const joined = nextSteps.join("\n")

    expect(joined).toContain("Azure SQL Database")
    expect(joined).toContain("Azure Storage")
    expect(joined).toContain("user_impersonation")
    expect(joined).toContain("admin consent")
  })

  it("documents the OBO scope choice and copying keys into .env", () => {
    const { nextSteps } = fabricOboTemplate.build(context(fabricDeps))
    const joined = nextSteps.join("\n")

    expect(joined).toContain("powerbi/api/.default")
    expect(joined).toContain("database.windows.net/.default")
    expect(joined.toLowerCase()).toContain(".env")
  })
})
