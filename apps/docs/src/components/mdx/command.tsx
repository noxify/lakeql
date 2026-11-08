import type { CommandProps } from "renoun"
import { CodeBlock } from "renoun/components"

import { ClientOnly } from "@/components/client-only"
import { CommandTabsClient } from "@/components/mdx/command-client"
import type {
  ExecutionMode,
  PackageManager,
} from "@/components/mdx/command-client"

const PACKAGE_MANAGERS: PackageManager[] = ["npm", "pnpm"]
const EXECUTION_MODES: ExecutionMode[] = ["local", "oneoff"]

/**
 * Package name published on the registry for the LakeQL CLI. The binary exposed
 * by the package is `lakeql-cli`, so one-off runners (`npx` / `pnpm dlx`) must
 * resolve the scoped package name, while a locally installed project runs the
 * binary directly.
 */
const CLI_PACKAGE_NAME = "@lakeql/cli"
const CLI_BINARY_NAME = "lakeql-cli"

function getChildrenText(children: React.ReactNode): string {
  const parts: string[] = []
  for (const child of Array.isArray(children) ? children : [children]) {
    if (typeof child === "string" || typeof child === "number") {
      parts.push(String(child))
    }
  }

  return parts.map((part) => part.trim()).join("")
}

const COMMAND_PREFIXES: Record<
  NonNullable<CommandProps["variant"]>,
  Record<PackageManager, string>
> = {
  create: {
    npm: "npm create",
    pnpm: "pnpm create",
  },
  exec: {
    npm: "npx",
    pnpm: "pnpm dlx",
  },
  install: {
    npm: "npm install",
    pnpm: "pnpm add",
  },
  "install-dev": {
    npm: "npm install --save-dev",
    pnpm: "pnpm add -D",
  },
  run: {
    npm: "npm run",
    pnpm: "pnpm",
  },
}

/**
 * Prefixes for `variant="exec"` across both execution modes. `local` runs the
 * installed project binary (`lakeql-cli`); `oneoff` fetches the scoped package
 * through a one-off runner.
 */
const EXEC_PREFIXES: Record<ExecutionMode, Record<PackageManager, string>> = {
  local: {
    npm: "npm exec",
    pnpm: "pnpm",
  },
  oneoff: {
    npm: "npx",
    pnpm: "pnpm dlx",
  },
}

function rewriteExecSubject(executionMode: ExecutionMode, subject: string) {
  if (executionMode === "local" || !subject.startsWith(CLI_BINARY_NAME)) {
    return subject
  }

  // One-off runners resolve a registry package by name, so the scoped package
  // name replaces the bare binary name.
  return `${CLI_PACKAGE_NAME}${subject.slice(CLI_BINARY_NAME.length)}`
}

function buildCommand(
  packageManager: PackageManager,
  variant: NonNullable<CommandProps["variant"]>,
  subject: string
): string {
  const prefix = COMMAND_PREFIXES[variant][packageManager]
  return `${prefix} ${subject}`.trim()
}

function buildExecCommand(
  packageManager: PackageManager,
  executionMode: ExecutionMode,
  subject: string
): string {
  const prefix = EXEC_PREFIXES[executionMode][packageManager]
  const resolvedSubject = rewriteExecSubject(executionMode, subject)
  return `${prefix} ${resolvedSubject}`.trim()
}

export const CommandWrapper = ({ children, variant }: CommandProps) => {
  const subject = getChildrenText(children)

  if (!variant) {
    return (
      <ClientOnly>
        <CodeBlock language="shell">{subject}</CodeBlock>
      </ClientOnly>
    )
  }

  if (variant === "exec") {
    const commands = PACKAGE_MANAGERS.flatMap((packageManager) =>
      EXECUTION_MODES.map((executionMode) => ({
        content: (
          <CodeBlock language="shell">
            {buildExecCommand(packageManager, executionMode, subject)}
          </CodeBlock>
        ),
        executionMode,
        packageManager,
      }))
    )

    return <CommandTabsClient commands={commands} showExecutionMode />
  }

  const commands = PACKAGE_MANAGERS.map((packageManager) => ({
    content: (
      <CodeBlock language="shell">
        {buildCommand(packageManager, variant, subject)}
      </CodeBlock>
    ),
    packageManager,
  }))

  return <CommandTabsClient commands={commands} />
}
