import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import path from "node:path"

import { Command } from "@commander-js/extra-typings"
import { question, select } from "@topcli/prompts"
import kleur from "kleur"

import type { LakeQLConfig } from "@/config"
import { getInvocationCwd } from "@/path-utils"

const CONFIG_FILES = [
  "lakeql.config.mjs",
  "lakeql.config.ts",
  "lakeql.config.json",
] as const

function serializeMjsConfig(config: LakeQLConfig): string {
  const entries = Object.entries(config)
    .map(([key, value]) => `  ${key}: ${JSON.stringify(value)},`)
    .join("\n")

  return `/** @type {import('@lakeql/cli').LakeQLConfig} */\nexport default {\n${entries}\n}\n`
}

function findExistingConfig(cwd: string): string | null {
  for (const name of CONFIG_FILES) {
    if (existsSync(path.join(cwd, name))) {
      return name
    }
  }
  return null
}

export default function initCommand() {
  const program = new Command("init")
    .description("Initialize a lakeql config file")
    .action(async () => {
      const cwd = getInvocationCwd()

      // Check if any config already exists
      const existing = findExistingConfig(cwd)

      if (existing) {
        const overwrite = await select(
          `${existing} already exists. Overwrite?`,
          {
            choices: [
              { label: "Yes", value: "yes" },
              { label: "No", value: "no" },
            ],
          }
        )

        if (overwrite === "no") {
          // oxlint-disable-next-line no-console
          console.log(kleur.yellow("Aborted."))
          return
        }
      }

      // Choose config format
      const format = await select("Config format:", {
        choices: [
          { label: "lakeql.config.mjs (recommended)", value: "mjs" },
          { label: "lakeql.config.json", value: "json" },
        ],
      })

      // Detect if a src directory exists
      const hasSrc = existsSync(path.join(cwd, "src"))

      let resolvedSourcePath: string

      if (hasSrc) {
        resolvedSourcePath = "src"
        // oxlint-disable-next-line no-console
        console.log(
          kleur.cyan(
            `Detected src/ directory — generated code will be placed in src/`
          )
        )
      } else {
        const sourcePath = await select(
          "Where should generated code be placed?",
          {
            choices: [
              { label: "./ (project root)", value: "." },
              { label: "Custom path", value: "__custom__" },
            ],
          }
        )

        resolvedSourcePath = sourcePath

        if (sourcePath === "__custom__") {
          const customPath = await question(
            "Enter the source path (relative to project root):",
            {
              defaultValue: ".",
            }
          )
          resolvedSourcePath = customPath
        }
      }

      const config: LakeQLConfig = {
        sourcePath: resolvedSourcePath,
      }

      const fileName =
        format === "mjs" ? "lakeql.config.mjs" : "lakeql.config.json"
      const configPath = path.join(cwd, fileName)

      const content =
        format === "mjs"
          ? serializeMjsConfig(config)
          : `${JSON.stringify(config, null, 2)}\n`

      await writeFile(configPath, content)

      // oxlint-disable-next-line no-console
      console.log(kleur.green(`Created ${fileName} at ${configPath}`))
    })

  return program
}
