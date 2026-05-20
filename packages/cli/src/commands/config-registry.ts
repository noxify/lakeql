import { existsSync } from "node:fs"
import { rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { Command } from "@commander-js/extra-typings"
import { generateCode } from "@lakeql/file-generator"
import { generateConfigReqistry } from "@lakeql/file-generator/config-registry"
import { globby } from "globby"

import { schemaPathOption } from "@/options"
import { resolveFromInvocationCwd } from "@/path-utils"

export default function configRegistryCommand() {
  const program = new Command("create-registry")
    .description(
      "Generates the config registry to ensure the type-safety while using `createPermission`"
    )
    .addOption(schemaPathOption)
    .action(async ({ schemaPath }) => {
      await runConfigRegistryGeneration(schemaPath)
    })

  return program
}

export async function runConfigRegistryGeneration(schemaPath: string) {
  const targetPath = resolveFromInvocationCwd(schemaPath)

  const configFiles = await globby("schemas/**/config.ts", {
    cwd: targetPath,
    onlyFiles: true,
  })

  // generate the query schema
  const generatedConfigRegistry = generateConfigReqistry({
    configPaths: configFiles.map((ele) => {
      const parsed = path.parse(ele)
      return path.join(parsed.dir, parsed.name)
    }),
  })

  const configRegistryTemplate = await generateCode({
    fileName: "config-registry.ts",
    nodes: generatedConfigRegistry,
  })

  if (existsSync(path.join(targetPath, "config-registry.ts"))) {
    await rm(path.join(targetPath, "config-registry.ts"), {
      force: true,
      recursive: true,
    })
  }
  await writeFile(
    path.join(targetPath, "config-registry.ts"),
    configRegistryTemplate.text
  )
}
