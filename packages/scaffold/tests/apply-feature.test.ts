import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { applyFeature, InvalidProjectError } from "../src/apply-feature"
import type { FeatureResult } from "../src/features/types"
import type { Op } from "../src/ops"
import { expr } from "../src/ts-serializer"

function result(ops: Op[], nextSteps: string[] = []): FeatureResult {
  return { ops, nextSteps }
}

describe("applying a feature into an existing project", () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), "scaffold-apply-"))
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  function writePackageJson(deps: Record<string, string> = {}): void {
    writeFileSync(
      path.join(projectDir, "package.json"),
      `${JSON.stringify({ name: "fixture", dependencies: deps }, null, 2)}\n`,
      "utf-8"
    )
  }

  function readJson(file: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path.join(projectDir, file), "utf-8"))
  }

  describe("addDeps", () => {
    it("adds a dependency only when absent and writes back sorted", () => {
      writePackageJson({ zod: "3.0.0" })

      const outcome = applyFeature(
        result([{ type: "addDeps", deps: { "@azure/identity": "4.14.0" } }]),
        { projectDir }
      )

      const pkg = readJson("package.json")
      expect(Object.keys(pkg.dependencies as object)).toStrictEqual([
        "@azure/identity",
        "zod",
      ])
      expect(outcome.applied).toContain(
        "added dependencies @azure/identity@4.14.0"
      )
    })

    it("leaves an existing dependency untouched (no downgrade)", () => {
      writePackageJson({ "@azure/identity": "4.0.0" })

      const outcome = applyFeature(
        result([{ type: "addDeps", deps: { "@azure/identity": "4.14.0" } }]),
        { projectDir }
      )

      const pkg = readJson("package.json")
      expect(
        (pkg.dependencies as Record<string, string>)["@azure/identity"]
      ).toBe("4.0.0")
      expect(outcome.applied).toStrictEqual([])
    })

    it("throws InvalidProjectError when package.json is missing", () => {
      expect(() =>
        applyFeature(
          result([{ type: "addDeps", deps: { "@azure/identity": "4.14.0" } }]),
          { projectDir }
        )
      ).toThrow(InvalidProjectError)
    })
  })

  describe("addEnvVars", () => {
    it("creates .env.example when absent", () => {
      writePackageJson()

      applyFeature(
        result([
          {
            type: "addEnvVars",
            group: "OBO",
            vars: { OBO_CLIENT_ID: "", OBO_TENANT_ID: "" },
          },
        ]),
        { projectDir }
      )

      const env = readFileSync(path.join(projectDir, ".env.example"), "utf-8")
      expect(env).toContain("# OBO")
      expect(env).toContain("OBO_CLIENT_ID=")
      expect(env).toContain("OBO_TENANT_ID=")
    })

    it("appends only the missing keys to an existing file", () => {
      writePackageJson()
      writeFileSync(
        path.join(projectDir, ".env.example"),
        "OBO_CLIENT_ID=existing\n",
        "utf-8"
      )

      const outcome = applyFeature(
        result([
          {
            type: "addEnvVars",
            group: "OBO",
            vars: { OBO_CLIENT_ID: "", OBO_TENANT_ID: "" },
          },
        ]),
        { projectDir }
      )

      const env = readFileSync(path.join(projectDir, ".env.example"), "utf-8")
      expect(env).toContain("OBO_CLIENT_ID=existing")
      expect(env).toContain("OBO_TENANT_ID=")
      expect(outcome.applied).toStrictEqual([
        "appended env OBO_TENANT_ID to .env.example",
      ])
    })
  })

  describe("addFile", () => {
    it("writes a file when absent", () => {
      writePackageJson()

      applyFeature(
        result([
          {
            type: "addFile",
            path: "src/resolver.ts",
            content: "export const x = 1\n",
          },
        ]),
        { projectDir }
      )

      expect(
        readFileSync(path.join(projectDir, "src/resolver.ts"), "utf-8")
      ).toBe("export const x = 1\n")
    })

    it("skips and reports an existing file without clobbering it", () => {
      writePackageJson()
      mkdirSync(path.join(projectDir, "src"), { recursive: true })
      writeFileSync(
        path.join(projectDir, "src", "resolver.ts"),
        "// user content\n",
        "utf-8"
      )

      const outcome = applyFeature(
        result([
          {
            type: "addFile",
            path: "src/resolver.ts",
            content: "export const x = 1\n",
          },
        ]),
        { projectDir }
      )

      expect(
        readFileSync(path.join(projectDir, "src/resolver.ts"), "utf-8")
      ).toBe("// user content\n")
      expect(outcome.applied).toContain(
        "skipped file src/resolver.ts (already exists)"
      )
    })
  })

  describe("guidance", () => {
    it("collects env-schema lines as guidance and never writes src/env.ts", () => {
      writePackageJson()

      const outcome = applyFeature(
        result([
          {
            type: "addEnvSchema",
            schema: { OBO_CLIENT_ID: "string().min(1)" },
          },
        ]),
        { projectDir }
      )

      expect(
        outcome.guidance.some((entry) =>
          entry.includes("    OBO_CLIENT_ID: string().min(1),")
        )
      ).toBeTruthy()
      expect(outcome.applied).toStrictEqual([])
    })

    it("collects data-source wiring as guidance naming the source", () => {
      writePackageJson()

      const outcome = applyFeature(
        result([
          {
            type: "addDataSource",
            name: "fabric",
            adapter: "fabric",
            config: { endpoint: expr("env.OBO_FABRIC_SCOPE") },
          },
        ]),
        { projectDir }
      )

      expect(
        outcome.guidance.some((line) => line.includes('"fabric" data source'))
      ).toBeTruthy()
      expect(
        outcome.guidance.some((line) => line.includes("env.OBO_FABRIC_SCOPE"))
      ).toBeTruthy()
    })

    it("appends the feature's next steps to the guidance", () => {
      writePackageJson()

      const outcome = applyFeature(
        result([], ["Grant admin consent in Azure."]),
        { projectDir }
      )

      expect(outcome.guidance).toContain("Grant admin consent in Azure.")
    })
  })

  describe("dry-run", () => {
    it("reports would-be writes without touching disk", () => {
      writePackageJson()

      const feature = result(
        [
          { type: "addDeps", deps: { "@azure/identity": "4.14.0" } },
          {
            type: "addEnvVars",
            group: "OBO",
            vars: { OBO_CLIENT_ID: "" },
          },
          { type: "addFile", path: "src/resolver.ts", content: "x\n" },
          { type: "addEnvSchema", schema: { OBO_CLIENT_ID: "string()" } },
        ],
        ["Next step."]
      )

      const outcome = applyFeature(feature, { projectDir, mode: "dry-run" })

      expect(outcome.applied).toStrictEqual([
        "would add dependencies @azure/identity@4.14.0",
        "would append env OBO_CLIENT_ID to .env.example",
        "would create src/resolver.ts",
      ])
      expect(outcome.guidance).toContain("Next step.")

      const pkg = readJson("package.json")
      expect(pkg.dependencies).toStrictEqual({})
      expect(() =>
        readFileSync(path.join(projectDir, ".env.example"), "utf-8")
      ).toThrow(/ENOENT/u)
      expect(() =>
        readFileSync(path.join(projectDir, "src/resolver.ts"), "utf-8")
      ).toThrow(/ENOENT/u)
    })
  })

  describe("idempotency", () => {
    it("is a no-op on a second run", () => {
      writePackageJson()

      const feature = result(
        [
          { type: "addDeps", deps: { "@azure/identity": "4.14.0" } },
          {
            type: "addEnvVars",
            group: "OBO",
            vars: { OBO_CLIENT_ID: "", OBO_TENANT_ID: "" },
          },
          { type: "addFile", path: "src/resolver.ts", content: "x\n" },
        ],
        []
      )

      applyFeature(feature, { projectDir })
      const pkgAfterFirst = readFileSync(
        path.join(projectDir, "package.json"),
        "utf-8"
      )
      const envAfterFirst = readFileSync(
        path.join(projectDir, ".env.example"),
        "utf-8"
      )

      const second = applyFeature(feature, { projectDir })

      expect(second.applied).toStrictEqual([
        "skipped file src/resolver.ts (already exists)",
      ])
      expect(readFileSync(path.join(projectDir, "package.json"), "utf-8")).toBe(
        pkgAfterFirst
      )
      expect(readFileSync(path.join(projectDir, ".env.example"), "utf-8")).toBe(
        envAfterFirst
      )
    })
  })
})
