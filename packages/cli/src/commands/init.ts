import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import path from "node:path"

import { Command } from "@commander-js/extra-typings"
import { question, select } from "@topcli/prompts"
import kleur from "kleur"

import { CONFIG_FILE_NAME, type LakeQLConfig } from "@/config"
import { getInvocationCwd } from "@/path-utils"

export default function initCommand() {
  const program = new Command("init")
    .description("Initialize a lakeql.config.json configuration file")
    .action(async () => {
      const cwd = getInvocationCwd()
      const configPath = path.join(cwd, CONFIG_FILE_NAME)

      if (existsSync(configPath)) {
        const overwrite = await select(
          `${CONFIG_FILE_NAME} already exists. Overwrite?`,
          {
            choices: [
              { label: "Yes", value: "yes" },
              { label: "No", value: "no" },
            ],
          }
        )

        if (overwrite === "no") {
          console.log(kleur.yellow("Aborted."))
          return
        }
      }

      // detect if a src directory exists
      const hasSrc = existsSync(path.join(cwd, "src"))

      let resolvedSourcePath: string

      if (hasSrc) {
        // If src/ exists, schemas always go in src/
        resolvedSourcePath = "src"
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

      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)

      console.log(kleur.green(`Created ${CONFIG_FILE_NAME} at ${configPath}`))
    })

  return program
}
