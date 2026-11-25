// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable unicorn/no-useless-undefined
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import ts from "typescript"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EndpointDefinitionFormat } from "@/pipeline/schema"

// Mock the config-registry to avoid env/config dependencies
vi.mock(import("@/commands/create-registry"), () => ({
  runConfigRegistryGeneration: vi.fn().mockResolvedValue(undefined),
  default: vi.fn(),
}))

const { generateEndpoint } = await import("@/pipeline/generate")

/**
 * Stand-in for `@lakeql/api/builder`: typechecking the generated files needs
 * only the shape of the `builder` calls, not the real Pothos types. The point
 * of the check is that `mutation-schema.ts` references only `storageConfig`
 * keys that `config.ts` emitted.
 */
const builderStub = `export declare const builder: {
  inputType(name: string, options: unknown): unknown
  mutationFields(fn: (t: any) => Record<string, unknown>): void
}
`

const fields: EndpointDefinitionFormat["fields"] = [
  { name: "id", type: "String" },
  { name: "event_date", type: "Date" },
  {
    name: "load_timestamp",
    type: "DateTime",
    options: { autoFill: "write_timestamp" },
  },
]

function definition(
  mutation: EndpointDefinitionFormat["mutation"],
  withAutoFill = false
): EndpointDefinitionFormat {
  return {
    version: "2.0",
    tableName: "events",
    catalog: "analytics",
    schema: "tracking",
    fields: withAutoFill ? fields : fields.slice(0, 2),
    mutation,
  }
}

const cases: [string, EndpointDefinitionFormat][] = [
  [
    "storage append with a partition string and an auto-fill field",
    definition(
      {
        loadStrategy: "append",
        basePath: "warehouse/events",
        partitioning: "event_date:year/event_date:month",
      },
      true
    ),
  ],
  [
    "storage full_load with a partition string",
    definition({
      loadStrategy: "full_load",
      basePath: "warehouse/events",
      partitioning: "event_date:year",
    }),
  ],
  [
    "insert with partitioning false",
    definition({
      loadStrategy: "append",
      writeMethod: "insert",
      partitioning: false,
    }),
  ],
  [
    "insert without partitioning",
    definition({ loadStrategy: "append", writeMethod: "insert" }),
  ],
]

describe("generated config.ts and mutation-schema.ts typecheck", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "generated-typecheck-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it.each(cases)(
    "%s",
    async (_name, def) => {
      const outputDir = path.join(dir, "endpoint")
      const { files } = await generateEndpoint({
        definition: def,
        outputDir,
        skipRegistry: true,
      })

      const stubDir = path.join(dir, "stubs")
      await mkdir(stubDir, { recursive: true })
      await writeFile(path.join(stubDir, "builder.d.ts"), builderStub)

      const program = ts.createProgram({
        rootNames: [
          path.join(outputDir, "config.ts"),
          path.join(outputDir, "mutation-schema.ts"),
        ],
        options: {
          noEmit: true,
          strict: true,
          // The stubbed builder leaves resolver parameters contextually untyped.
          noImplicitAny: false,
          skipLibCheck: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          resolveJsonModule: true,
          esModuleInterop: true,
          types: [],
          paths: {
            "@lakeql/api/builder": [path.join(stubDir, "builder.d.ts")],
          },
        },
      })
      const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))

      expect(diagnostics).toStrictEqual([])

      // The resolver references exactly the storageConfig keys config.ts emits.
      const config =
        files.find((f) => f.fileName === "config.ts")?.content ?? ""
      const mutation =
        files.find((f) => f.fileName === "mutation-schema.ts")?.content ?? ""
      const storageBlock = config.slice(
        config.indexOf("export const storageConfig")
      )
      for (const key of ["basePath", "partitioning", "autoFillFields"]) {
        expect(mutation.includes(`storageConfig.${key}`)).toBe(
          new RegExp(`^\\s+${key}:`, "mu").test(storageBlock)
        )
      }
      expect(mutation).toContain("storageConfig.writeMethod")
    },
    60_000
  )
})
