import { Command } from "@commander-js/extra-typings"
import { readPackage } from "read-pkg"

import createEndpointCommand from "@/commands/create-endpoint"
import listColumnsCommand from "@/commands/list-columns"
import listSchemasCommand from "@/commands/list-schemas"
import listTablesCommand from "@/commands/list-tables"
import listViewsCommand from "@/commands/list-views"
import pullCommand from "@/commands/pull"

import createRegistryCommand from "./commands/create-registry"
import initCommand from "./commands/init"

interface PackageInfo {
  version: string
}

function createProgram(packageInfo: PackageInfo) {
  const program = new Command()

  program.configureHelp({
    sortSubcommands: true,
    // subcommandTerm: (cmd) => cmd.name(), // Just show the name, instead of short usage.
  })

  program
    .name("lakeql-cli")
    .description("LakeQL CLI")
    .version(packageInfo.version)
    .addCommand(listSchemasCommand())
    .addCommand(listTablesCommand())
    .addCommand(listViewsCommand())
    .addCommand(listColumnsCommand())
    .addCommand(pullCommand())
    .addCommand(createEndpointCommand())
    .addCommand(createRegistryCommand())
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
