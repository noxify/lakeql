import { readPackage } from "read-pkg"

import addCommand from "@/commands/add"
import createEndpointCommand from "@/commands/create-endpoint"
import generateImportConfigCommand from "@/commands/generate-import-config"
import listColumnsCommand from "@/commands/list-columns"
import listSchemasCommand from "@/commands/list-schemas"
import listTablesCommand from "@/commands/list-tables"
import listViewsCommand from "@/commands/list-views"
import pullCommand from "@/commands/pull"
import { applyEnvOption } from "@/env-file"
import { buildProgramStructure } from "@/metadata/program-metadata"

import createRegistryCommand from "./commands/create-registry"
import initCommand from "./commands/init"

interface PackageInfo {
  version: string
}

function createProgram(packageInfo: PackageInfo) {
  const program = buildProgramStructure()

  program.configureHelp({
    sortSubcommands: true,
    // subcommandTerm: (cmd) => cmd.name(), // Just show the name, instead of short usage.
  })

  program
    .version(packageInfo.version)
    // --env is a global option (defined in buildProgramStructure). This hook
    // runs after the global options are parsed but before the subcommand's
    // action, so the env file is loaded before the command reads lakeql.config.
    .hook("preSubcommand", (thisCommand) => {
      const { env } = thisCommand.opts()
      applyEnvOption(env)
    })
    .addCommand(addCommand())
    .addCommand(listSchemasCommand())
    .addCommand(listTablesCommand())
    .addCommand(listViewsCommand())
    .addCommand(listColumnsCommand())
    .addCommand(pullCommand())
    .addCommand(createEndpointCommand())
    .addCommand(createRegistryCommand())
    .addCommand(generateImportConfigCommand())
    .addCommand(initCommand())

  return program
}

export async function runCli(
  argv = process.argv.slice(2),
  packageInfo?: PackageInfo
) {
  const resolvedPackageInfo = packageInfo ?? (await readPackage())
  const program = createProgram(resolvedPackageInfo)

  if (argv.length === 0) {
    program.outputHelp()
    return 0
  }

  await program.parseAsync(argv, { from: "user" })
  return 0
}
