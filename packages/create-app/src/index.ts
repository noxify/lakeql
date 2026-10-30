#!/usr/bin/env node
/* eslint-disable no-console */
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import { cancel, intro, note, outro, tasks } from "@clack/prompts"
import { buildPlan, materializeFiles } from "@lakeql/scaffold"
import pc from "picocolors"
import terminalLink from "terminal-link"

import { buildCreateAppCommandStructure } from "./command-metadata"
import type { AdapterDefinition } from "./features/adapters"
import { opsForAdapters } from "./features/adapters"
import { opsForAuth } from "./features/auth"
import { ensureUniqueValues } from "./materialize"
import {
  promptAdapters,
  promptDataSourceNames,
  resolveAdaptersFromFlag,
  resolveDsNamesFromFlag,
} from "./prompts/adapters"
import { promptAuthStrategy, resolveAuthFromFlag } from "./prompts/auth"
import {
  promptInstallDeps,
  selectPackageManager,
  validatePackageManager,
} from "./prompts/install"
import { promptProjectName, validateProjectName } from "./prompts/project-name"
import {
  allowsExoticSubdeps,
  installDependencies,
} from "./runtime/dependencies"
import {
  invocationCwd,
  resolveLocalTemplateDir,
  resolveTargetDir,
} from "./runtime/local-template"
import { updatePackageJson } from "./runtime/package-json"
import { downloadTemplate } from "./runtime/template"

// === Gather user input (prompts or flags) ===

async function gatherConfig(
  argProjectName: string | undefined,
  opts: {
    adapters?: string
    auth?: string
    dsNames?: string
    install: boolean
    packageManager?: string
    pm?: string
  },
  localMode: boolean
) {
  const projectName = argProjectName || (await promptProjectName())
  if (argProjectName) {
    validateProjectName(projectName)
  }

  const cliAdapters = opts.adapters?.split(",")
  const selectedAdapters = cliAdapters
    ? resolveAdaptersFromFlag(cliAdapters)
    : await promptAdapters()

  const cliDsNames = opts.dsNames?.split(",")
  const dsNames = cliDsNames
    ? resolveDsNamesFromFlag(selectedAdapters, cliDsNames)
    : await promptDataSourceNames(selectedAdapters)

  ensureUniqueValues(dsNames)

  const authStrategy = opts.auth
    ? resolveAuthFromFlag(opts.auth)
    : await promptAuthStrategy()

  // In local mode the surrounding monorepo owns installation, so the generated
  // project is never installed in isolation. Skip the install/package-manager
  // prompts entirely instead of asking questions whose answers are unused.
  // The package manager is only used to render the next-steps hints; a local
  // monorepo is driven by pnpm, so report that rather than a generic npm.
  if (localMode) {
    return {
      authStrategy,
      dsNames,
      installDeps: false,
      packageManager: "pnpm",
      projectName,
      selectedAdapters,
    }
  }

  const cliPackageManager = opts.packageManager
  let installDeps = opts.install
  if (opts.install && !cliPackageManager) {
    installDeps = await promptInstallDeps()
  }

  const packageManager =
    installDeps && cliPackageManager
      ? validatePackageManager(cliPackageManager)
      : installDeps
        ? await selectPackageManager()
        : "npm"

  return {
    authStrategy,
    dsNames,
    installDeps,
    packageManager,
    projectName,
    selectedAdapters,
  }
}

// === Execute scaffolding tasks ===

async function executeTasks(opts: {
  adapters: AdapterDefinition[]
  authStrategy: string
  dsNames: Record<string, string>
  dryRun: boolean
  installDeps: boolean
  localTemplateDir?: string
  packageManager: string
  projectName: string
  targetDir: string
}) {
  // Auth ops first so the Authentication section leads the generated
  // .env.example; adapters follow in selection order. Ordering is irrelevant
  // for the keyed deps/dataSources/adapters maps.
  const plan = buildPlan([
    ...opsForAuth(opts.authStrategy),
    ...opsForAdapters(opts.adapters, opts.dsNames),
  ])

  const localMode = opts.localTemplateDir !== undefined

  // Surface the relaxed install setting rather than applying it silently.
  // Only a pnpm install of a pkg.pr.new preview build opts out of pnpm's
  // exotic-subdependency block (see allowsExoticSubdeps); released scaffolds
  // never hit this path.
  if (
    opts.installDeps &&
    !opts.dryRun &&
    !localMode &&
    allowsExoticSubdeps(opts.packageManager)
  ) {
    note(
      [
        "This is a pkg.pr.new preview build, so the generated project pins its",
        "@lakeql/* dependencies (and their transitive @lakeql/* deps) to",
        "pkg.pr.new URLs. The generated pnpm-workspace.yaml sets",
        "`blockExoticSubdeps: false` so pnpm resolves those URL subdependencies",
        "on install and on every later pnpm command. Released scaffolds resolve",
        "from npm and never set this.",
      ].join(" "),
      "Preview build"
    )
  }

  await tasks([
    {
      title: localMode ? "Copying local template" : "Downloading template",
      task: async () => {
        await downloadTemplate(opts.targetDir, opts.localTemplateDir)
        return localMode ? "Template copied" : "Template downloaded"
      },
    },
    {
      title: "Configuring package.json",
      task: async () => {
        await updatePackageJson(
          opts.targetDir,
          opts.projectName,
          plan.deps,
          plan.devDeps,
          localMode
        )
        return "Dependencies configured"
      },
    },
    {
      title: "Generating project files",
      task: () => {
        materializeFiles(
          opts.targetDir,
          plan,
          opts.dryRun ? "dry-run" : "write"
        )
        return "Files generated"
      },
    },
    {
      enabled: opts.installDeps && !opts.dryRun,
      title: localMode
        ? "Skipping install (local monorepo owns dependencies)"
        : `Installing dependencies with ${opts.packageManager}`,
      task: async () => {
        await installDependencies(
          opts.targetDir,
          opts.packageManager,
          localMode
        )
        return localMode
          ? "Install skipped (run install from the monorepo root)"
          : "Dependencies installed"
      },
    },
  ])
}

// === CLI Program ===

const program = buildCreateAppCommandStructure().action(
  async (argProjectName, opts) => {
    const quietMode = opts.quiet ?? false
    const dryRun = opts.dryRun ?? false

    if (quietMode) {
      console.clear = () => null
      console.log = () => null
      console.warn = () => null
    } else {
      console.clear()
      intro(pc.bgCyan(pc.black(" create-lakeql-app ")))
    }

    const localTemplateDir = resolveLocalTemplateDir(opts.local)
    const localMode = localTemplateDir !== undefined

    const config = await gatherConfig(argProjectName, opts, localMode)
    const targetDir = resolveTargetDir(opts.targetDir, config.projectName)
    const displayPath = path.relative(invocationCwd(), targetDir) || "."

    if (existsSync(targetDir)) {
      cancel(`Directory ${displayPath} already exists`)
      return process.exit(1)
    }

    mkdirSync(targetDir, { recursive: true })

    try {
      await executeTasks({
        adapters: config.selectedAdapters,
        authStrategy: config.authStrategy,
        dsNames: config.dsNames,
        dryRun,
        installDeps: config.installDeps,
        localTemplateDir,
        packageManager: config.packageManager,
        projectName: config.projectName,
        targetDir,
      })
    } catch (error) {
      // The @clack/prompts task spinner reports a generic "Something went
      // wrong" and discards the underlying cause. Surface the real error so
      // failures (e.g. a missing local template dir) are actionable.
      const message = error instanceof Error ? error.message : String(error)
      cancel(`Scaffolding failed: ${message}`)
      return process.exit(1)
    }

    if (!quietMode) {
      // In local mode the monorepo root owns installation, so the install
      // step runs there (not inside the generated project).
      const installStep = localMode
        ? [`${config.packageManager} install  # from the monorepo root`]
        : config.installDeps
          ? []
          : [`${config.packageManager} install`]

      const nextSteps = [
        ...installStep,
        `cd ${displayPath}`,
        "cp .env.example .env",
        `${config.packageManager} run cli pull --source-path ./src`,
        `${config.packageManager} run dev`,
      ].join("\n")

      note(
        `${pc.green("Created")} ${displayPath}\nAdapters: ${config.selectedAdapters.map((a) => a.label).join(", ")}`,
        "Done"
      )
      note(nextSteps, "Next steps")
      note(
        [
          terminalLink("Repository", "https://github.com/noxify/lakeql"),
          terminalLink("Documentation", "https://lakeql.dev/docs"),
        ].join("\n"),
        "Learn more"
      )
      outro(pc.green("Happy building!"))
    }
  }
)

program.parse()
