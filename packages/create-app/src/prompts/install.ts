import { cancel, confirm, isCancel, select } from "@clack/prompts"

const VALID_PACKAGE_MANAGERS = ["npm", "pnpm", "yarn"]

export async function promptInstallDeps(): Promise<boolean> {
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

export async function selectPackageManager(): Promise<string> {
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

export function validatePackageManager(pm?: string): string {
  if (!pm || !VALID_PACKAGE_MANAGERS.includes(pm)) {
    cancel(
      `Invalid package manager: ${pm}. Valid options: ${VALID_PACKAGE_MANAGERS.join(", ")}`
    )
    process.exit(1)
  }
  return pm
}
