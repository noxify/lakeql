#!/usr/bin/env node
import { Command } from "@commander-js/extra-typings"
import { readPackage } from "read-pkg"

import createEndpointCommand from "@/commands/create-endpoint"
import listColumnsCommand from "@/commands/list-columns"
import listSchemasCommand from "@/commands/list-schemas"
import listTablesCommand from "@/commands/list-tables"
import listViewsCommand from "@/commands/list-views"
import pullCommand from "@/commands/pull"

import configRegistryCommand from "./commands/config-registry"
import initCommand from "./commands/init"

async function main() {
  const packageInfo = await readPackage()

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
    .addCommand(configRegistryCommand())
    .addCommand(initCommand())

  await program.parseAsync()
}

// oxlint-disable-next-line promise/prefer-await-to-then
main().catch(() => {
  process.exit(1)
})
