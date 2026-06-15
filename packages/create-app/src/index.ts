#!/usr/bin/env node
/* eslint-disable no-console */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { installPackage } from "@antfu/install-pkg"
import {
  cancel,
  confirm,
  intro,
  isCancel,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts"
import { downloadTemplate as download } from "giget"
import pc from "picocolors"
import { readPackage } from "read-pkg"
import terminalLink from "terminal-link"

interface Template {
  name: string
  alias: string
  description: string
  path: string
}

interface NpmPackageData {
  version: string
}

const template: Template = {
  alias: "app",
  description: "LakeQL app template",
  name: "app",
  path: "templates/app",
}

async function getLatestVersion(packageName: string): Promise<string> {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${packageName}/latest`
    )
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = (await response.json()) as NpmPackageData
    return `^${data.version}`
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch {
    console.warn(
      pc.yellow(
        `⚠️  Could not fetch latest version for ${packageName}, using '*'`
      )
    )
    return "*"
  }
}

async function downloadTemplate(targetDir: string): Promise<void> {
  const s = spinner()
  s.start("Downloading template...")

  try {
    await download(`github:noxify/lakeql/${template.path}`, {
      dir: targetDir,
      offline: false,
    })
    s.stop("Template downloaded successfully!")
  } catch (error) {
    s.stop("Failed to download template")
    throw error
  }
}

async function updatePackageJson(
  targetDir: string,
  projectName: string
): Promise<void> {
  const s = spinner()
  s.start("Updating package.json...")

  try {
    if (!existsSync(targetDir)) {
      s.stop("Target directory not found")
      return
    }

    const packageJson = await readPackage({ cwd: targetDir })

    // Update project name
    const updatedPackageJson = {
      ...packageJson,
      name: projectName,
    }

    // Get latest versions
    const workspaceDeps = [
      ...Object.entries(updatedPackageJson.dependencies ?? {})
        .filter(([, v]) => v === "workspace:*")
        .map(([name]) => ({ name, target: "dependencies" as const })),
      ...Object.entries(updatedPackageJson.devDependencies ?? {})
        .filter(([, v]) => v === "workspace:*")
        .map(([name]) => ({ name, target: "devDependencies" as const })),
    ]

    const versions = await Promise.all(
      workspaceDeps.map(({ name }) => getLatestVersion(name))
    )

    // Replace workspace:* with resolved versions
    for (const [i, { name, target }] of workspaceDeps.entries()) {
      const deps = updatedPackageJson[target]
      const version = versions[i]
      if (deps && version) {
        deps[name] = version
      }
    }

    // Remove workspace-specific fields
    delete updatedPackageJson.private

    writeFileSync(
      path.resolve(targetDir, "package.json"),
      JSON.stringify(updatedPackageJson, null, 2)
    )
    s.stop("Package.json updated!")
  } catch (error) {
    s.stop("Failed to update package.json")
    throw error
  }
}

interface ParsedArgs {
  cliPackageManager?: string
  noInstall: boolean
  projectName?: string
  quietMode: boolean
}

interface ProjectConfig {
  installDeps: boolean
  packageManager: string
  projectName: string
  quietMode: boolean
}

const VALID_PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"]
const PROJECT_NAME_REGEX = /^[a-z0-9-_]+$/u

function parseArguments(): ParsedArgs {
  const args = process.argv.slice(2)
  const pmFlag = args.find(
    (arg) => arg.startsWith("--package-manager=") || arg.startsWith("-pm=")
  )

  return {
    cliPackageManager: pmFlag?.split("=")[1],
    noInstall: args.includes("--no-install"),
    projectName: args.find((arg) => !arg.startsWith("-")),
    quietMode: args.includes("--quiet") || args.includes("-q"),
  }
}

function setupQuietMode(): void {
  console.clear = () => null
  console.log = () => null
  console.warn = () => null
}

async function promptProjectName(): Promise<string> {
  const result = await text({
    message: "What is your project name?",
    placeholder: "my-lakeql-app",
    validate: (value) => {
      if (!value) {
        return "Project name is required"
      }
      if (!PROJECT_NAME_REGEX.test(value)) {
        return "Project name must contain only lowercase letters, numbers, hyphens, and underscores"
      }
    },
  })

  if (isCancel(result)) {
    cancel("Operation cancelled")
    process.exit(0)
  }

  return result
}

function validateProjectName(name: string): void {
  if (!PROJECT_NAME_REGEX.test(name)) {
    cancel(
      "Project name must contain only lowercase letters, numbers, hyphens, and underscores"
    )
    process.exit(1)
  }
}

async function promptInstallDeps(): Promise<boolean> {
  const result = await confirm({
    initialValue: true,
    message: "Install dependencies?",
  })

  if (isCancel(result)) {
    cancel("Operation cancelled")
    process.exit(0)
  }

  return result
}

function validatePackageManager(pm?: string): string {
  if (!pm || !VALID_PACKAGE_MANAGERS.includes(pm)) {
    cancel(
      `Invalid package manager: ${pm}. Valid options: ${VALID_PACKAGE_MANAGERS.join(", ")}`
    )
    process.exit(1)
  }
  return pm
}

async function selectPackageManager(): Promise<string> {
  const result = await select({
    message: "Which package manager?",
    options: [
      { label: "npm", value: "npm" },
      { label: "pnpm", value: "pnpm" },
      { label: "yarn", value: "yarn" },
    ],
  })

  if (isCancel(result)) {
    cancel("Operation cancelled")
    process.exit(0)
  }

  return result
}

async function installDependencies(
  targetDir: string,
  packageManager: string
): Promise<void> {
  const s = spinner()
  s.start(`Installing dependencies with ${packageManager}...`)

  try {
    await installPackage([], {
      cwd: targetDir,
      packageManager,
      silent: true,
    })
    s.stop("Dependencies installed!")
  } catch {
    s.stop("Failed to install dependencies")
    console.log(pc.yellow("You can install them manually with:"))
    console.log(pc.cyan(`  cd ${path.resolve(targetDir).split("/").pop()}`))
    console.log(pc.cyan(`  ${packageManager} install`))
  }
}

function printSuccessMessage(config: ProjectConfig): void {
  outro(pc.green("🎉 Project created successfully!"))

  console.log()
  console.log("Next steps:")
  console.log(pc.cyan(`  cd ${config.projectName}`))
  if (!config.installDeps) {
    console.log(pc.cyan(`  ${config.packageManager} install`))
  }
  console.log(pc.cyan(`  cp .env.example .env`))
  console.log(pc.gray(`  # edit .env and fill in valid values`))
  console.log(pc.cyan(`  ${config.packageManager} run cli pull --target ./src`))
  console.log(pc.cyan(`  ${config.packageManager} run dev`))
  console.log()
  console.log("Learn more:")
  console.log(
    `  ${terminalLink("Repository", "https://github.com/noxify/lakeql")}`
  )
  console.log(`  ${terminalLink("Documentation", "https://lakeql.dev/docs")}`)
}

async function main() {
  const {
    cliPackageManager,
    noInstall,
    projectName: argProjectName,
    quietMode,
  } = parseArguments()

  if (quietMode) {
    setupQuietMode()
  } else {
    console.clear()
    intro(pc.bgCyan(pc.black(" create-lakeql-app ")))
  }

  // Get or prompt project name
  const projectName = argProjectName || (await promptProjectName())
  if (!argProjectName) {
    validateProjectName(projectName)
  }

  // Get or prompt install dependencies
  let installDeps = !noInstall
  if (!noInstall && !cliPackageManager) {
    installDeps = await promptInstallDeps()
  }

  // Get or prompt package manager
  const packageManager =
    installDeps && cliPackageManager
      ? validatePackageManager(cliPackageManager)
      : installDeps
        ? await selectPackageManager()
        : "npm"

  // Setup project
  const targetDir = path.resolve(projectName)

  if (existsSync(targetDir)) {
    cancel(`Directory ${projectName} already exists`)
    return process.exit(1)
  }

  mkdirSync(targetDir, { recursive: true })

  try {
    const config: ProjectConfig = {
      installDeps,
      packageManager,
      projectName,
      quietMode,
    }

    await downloadTemplate(targetDir)
    await updatePackageJson(targetDir, projectName)

    if (installDeps) {
      await installDependencies(targetDir, packageManager)
    }

    if (!quietMode) {
      printSuccessMessage(config)
    }
  } catch (error) {
    if (!quietMode) {
      console.error(pc.red("❌ Failed to create project:"), error)
    }
    process.exit(1)
  }
}

// oxlint-disable-next-line promise/prefer-await-to-then
main().catch(console.error)
